import { User, Validator, WithdrawalAddress } from '@prisma/client';
import format from 'date-fns/format';
import { formatEther, formatUnits } from 'ethers/lib/utils.js';

import { geSlotsInfo } from '@/src/api/slot.js';
import { getUserValidatorsInfo } from '@/src/api/user.js';
import { getPrisma } from '@/src/config/prisma.js';
import { TG_ERROR_SAME_MESSAGE } from '@/src/constants/index.js';
import { env } from '@/src/env.js';
import { CustomLogger } from '@/src/lib/pino.js';
import { notifyInactiveValidators } from '@/src/scheduler/tasks/notifyInactiveValidators.js';
import { notifyUnderPerformance } from '@/src/scheduler/tasks/notifyUnderPerformance.js';
import { tokenPrice } from '@/src/scheduler/tasks/tokenPriceTask.js';
import {
  calculateAPY_daily,
  calculateAPY_weekly,
  calculateMonthlyAPY,
} from '@/src/scheduler/tasks/utils/apy.js';
import {
  getDailyExecutionRewardsMemoized,
  getDailyValidatorStatsMemoized,
} from '@/src/scheduler/tasks/utils/dailyValidatorStats.js';
import {
  getMonthlyExecutionRewardsMemoized,
  getMonthlyValidatorStatsMemoized,
} from '@/src/scheduler/tasks/utils/monthlyValidatorsStats.js';
import {
  getWeeklyExecutionRewardsMemoized,
  getWeeklyValidatorStatsMemoized,
} from '@/src/scheduler/tasks/utils/weeklyValidatorStats.js';
import { editMessageText, sendMessage } from '@/src/telegram/utils/messaging.js';
import { epochsIn1h } from '@/src/utils/beacon.js';
import { AppError } from '@/src/utils/errors/AppError.js';
import { getWithdrawableAmountByUserId } from '@/src/utils/getWithdrawableAmountByUserId.js';
import { formatNumber } from '@/src/utils/misc.js';
import { escapeMarkdown } from '@/src/utils/telegram.js';

const prisma = getPrisma();

// 1 token = 1e9 gWei
const gWei = BigInt(10) ** BigInt(9);
// 1 GNO = 32 mGNO, 1 ETH = 1 ETH
const tokenMultiplier = env.BLOCKCHAIN_TOKEN_SYMBOL === 'GNO' ? BigInt(32) : BigInt(1);

interface ValidatorByStatus {
  activeIds: number[];
  inactiveIds: number[];
  slashedIds: number[];
  exitedIds: number[];
}

interface UserStats {
  performance1h: number | null;
  balance: number;
  withdrawable: {
    total: string;
    value: string;
  };
  apy?: number;
  rewards: {
    daily?: {
      apy: number;
      consensus: number;
      execution: number;
      usd: number;
    };
    weekly?: {
      apy: number;
      consensus: number;
      execution: number;
      usd: number;
    };
    monthly?: {
      apy: number;
      consensus: number;
      execution: number;
      usd: number;
    };
  } | null;
  validatorStats: ValidatorByStatus;
}

async function getUserAllStats(
  syncing: boolean,
  maxSlotToQuery: number,
  maxEpochToQuery: number,
  user: User & {
    validators: Validator[];
    withdrawalAddresses: WithdrawalAddress[];
  },
  logger: CustomLogger,
): Promise<UserStats> {
  const userValidatorsInfo = await getUserValidatorsInfo(user.loginId);
  const missedAttestations = userValidatorsInfo.missedAttestations;

  // merge the validator statuses for all the withdrawal addresses
  const validatorStatuses: ValidatorByStatus = Object.values(
    userValidatorsInfo.validatorsByWithdrawal,
  ).reduce(
    (acc, statuses) => ({
      activeIds: [...acc.activeIds, ...statuses.activeIds],
      inactiveIds: [...acc.inactiveIds, ...statuses.inactiveIds],
      slashedIds: [...acc.slashedIds, ...statuses.slashedIds],
      exitedIds: [...acc.exitedIds, ...statuses.exitedIds],
    }),
    {
      activeIds: [],
      inactiveIds: [],
      slashedIds: [],
      exitedIds: [],
    },
  );

  const beaconActiveValidators =
    validatorStatuses.activeIds.length + validatorStatuses.inactiveIds.length;
  // const beaconActiveValidators = user.validators.filter(
  //   (v) =>
  //     v.status === VALIDATOR_STATUS.active_ongoing || v.status === VALIDATOR_STATUS.active_exiting,
  // );
  const [performance1h, balance, tableStats, withdrawable] = await Promise.all([
    //getValidatorStatuses(user, beaconActiveValidators, missedAttestations, maxEpochToQuery),
    get1hPerformance(syncing, missedAttestations.length, beaconActiveValidators),
    getUserBalance(user.validators),
    getUserRewards(user, logger),
    getWithdrawableAmountByUserId(Number(user.id)),
  ]);

  return {
    performance1h,
    validatorStats: validatorStatuses,
    balance,
    withdrawable: {
      total: withdrawable.toFixed(2),
      value: (withdrawable * tokenPrice).toFixed(0),
    },
    apy: 0,
    rewards: tableStats,
  };
}

async function get1hPerformance(
  syncing: boolean,
  missedAttestations: number,
  userActiveValidators: number,
) {
  if (syncing) return null;

  if (!userActiveValidators) return null;
  const expectedAttestations = epochsIn1h * userActiveValidators;

  const performancePercentage =
    ((expectedAttestations - missedAttestations) / expectedAttestations) * 100;

  return performancePercentage;
}

function getUserBalance(validators: Validator[]) {
  const totalBalance = validators.reduce(
    (acc, validator) => acc + BigInt(validator.balance.toString()),
    BigInt(0),
  );

  const total_bn = totalBalance / tokenMultiplier;
  return Number(formatUnits(total_bn, 9));
}

// Helper function to convert gWei over mToken to token amount
function getFormattedRewards(stats: {
  head: string;
  target: string;
  source: string;
  inactivity: string;
  syncCommittee: string;
  blockReward: string;
}) {
  const totalInGwei =
    BigInt(stats.head) +
    BigInt(stats.target) +
    BigInt(stats.source) +
    BigInt(stats.inactivity) +
    BigInt(stats.syncCommittee) +
    BigInt(stats.blockReward);

  const wei = (totalInGwei * gWei) / tokenMultiplier;
  return {
    wei,
    token: Number(formatEther(wei)),
  };
}

async function getUserRewards(
  user: User & { validators: Validator[] },
  logger: CustomLogger,
): Promise<UserStats['rewards']> {
  logger.info(`stats`);
  const [
    dailyValidatorStats,
    dailyExecutionRewards,
    weeklyValidatorStats,
    weeklyExecutionRewards,
    monthlyValidatorStats,
    monthlyExecutionRewards,
  ] = await Promise.all([
    getDailyValidatorStatsMemoized(Number(user.id)),
    getDailyExecutionRewardsMemoized(Number(user.id)),
    getWeeklyValidatorStatsMemoized(Number(user.id)),
    getWeeklyExecutionRewardsMemoized(Number(user.id)),
    getMonthlyValidatorStatsMemoized(Number(user.id)),
    getMonthlyExecutionRewardsMemoized(Number(user.id)),
  ]);
  logger.info(`stats done`);

  // If no daily stats, return default values instead of null
  if (!dailyValidatorStats.length) {
    return {
      daily: {
        apy: 0,
        consensus: 0,
        execution: 0,
        usd: 0,
      },
      weekly: {
        apy: 0,
        consensus: 0,
        execution: 0,
        usd: 0,
      },
      monthly: {
        apy: 0,
        consensus: 0,
        execution: 0,
        usd: 0,
      },
    };
  }

  // Calculate daily stats
  const totalDailyConsensus = getFormattedRewards(dailyValidatorStats[0]);
  const totalDailyExecution = Number(formatEther(dailyExecutionRewards[0].total.toString()));
  const totalDailyExecutionInToken = env.BLOCKCHAIN_FEE_REWARDS_IN_STABLE
    ? totalDailyExecution / tokenPrice
    : totalDailyExecution;
  const totalDailyUsd =
    totalDailyConsensus.token * tokenPrice +
    (env.BLOCKCHAIN_FEE_REWARDS_IN_STABLE ? totalDailyExecution : totalDailyExecution * tokenPrice);

  // Calculate weekly stats
  const totalWeeklyConsensus = getFormattedRewards(weeklyValidatorStats[0]);
  const totalWeeklyExecution = Number(formatEther(weeklyExecutionRewards[0].total.toString()));
  const totalWeeklyExecutionInToken = env.BLOCKCHAIN_FEE_REWARDS_IN_STABLE
    ? totalWeeklyExecution / tokenPrice
    : totalWeeklyExecution;
  const totalWeeklyUsd =
    totalWeeklyConsensus.token * tokenPrice +
    (env.BLOCKCHAIN_FEE_REWARDS_IN_STABLE
      ? totalWeeklyExecution
      : totalWeeklyExecution * tokenPrice);

  // Calculate monthly stats
  const totalMonthlyConsensus = getFormattedRewards(monthlyValidatorStats[0]);
  const totalMonthlyExecution = Number(formatEther(monthlyExecutionRewards[0].total.toString()));
  const totalMonthlyExecutionInToken = env.BLOCKCHAIN_FEE_REWARDS_IN_STABLE
    ? totalMonthlyExecution / tokenPrice
    : totalMonthlyExecution;
  const totalMonthlyUsd =
    totalMonthlyConsensus.token * tokenPrice +
    (env.BLOCKCHAIN_FEE_REWARDS_IN_STABLE
      ? totalMonthlyExecution
      : totalMonthlyExecution * tokenPrice);

  // Calculate total balance in tokens
  // The balance comes in gWei, so we need to convert it to tokens
  const totalBalance = Number(
    user.validators.reduce(
      (acc, validator) => acc + BigInt(validator.balance.toString()),
      BigInt(0),
    ) /
      gWei /
      tokenMultiplier,
  );

  // Calculate APY
  const dailyApy = calculateAPY_daily(
    totalBalance,
    totalDailyConsensus.token + totalDailyExecutionInToken,
  );
  const weeklyApy = calculateAPY_weekly(
    totalBalance,
    totalWeeklyConsensus.token + totalWeeklyExecutionInToken,
  );
  const monthlyApy = calculateMonthlyAPY(
    totalBalance,
    totalMonthlyConsensus.token + totalMonthlyExecutionInToken,
  );

  return {
    daily: {
      apy: dailyApy,
      consensus: totalDailyConsensus.token,
      execution: totalDailyExecution,
      usd: totalDailyUsd,
    },
    weekly: {
      apy: weeklyApy,
      consensus: totalWeeklyConsensus.token,
      execution: totalWeeklyExecution,
      usd: totalWeeklyUsd,
    },
    monthly: {
      apy: monthlyApy,
      consensus: totalMonthlyConsensus.token,
      execution: totalMonthlyExecution,
      usd: totalMonthlyUsd,
    },
  };
}

// Helper function to format table columns
function formatTableColumn(
  value: string | number,
  width: number,
  align: 'left' | 'center' | 'right' = 'center',
): string {
  const strValue = String(value);
  const padding = width - strValue.length;

  if (padding <= 0) return strValue;

  const leftPad = align === 'center' ? Math.floor(padding / 2) : align === 'right' ? padding : 0;
  const rightPad = padding - leftPad;

  return ' '.repeat(leftPad) + strValue + ' '.repeat(rightPad);
}

function formatStatsMessage(
  loginId: string,
  stats: UserStats,
  status: {
    syncing: boolean;
    headSlot: number;
    maxSlotToQuery: number;
  },
): string {
  const { performance1h: performance, balance, withdrawable, validatorStats } = stats;

  const syncStatus = status.syncing
    ? `⚠️ ${status.headSlot - status.maxSlotToQuery} slots behind ⚠️`
    : null;

  // Define message sections
  const validatorStatus = status.syncing
    ? `⚪️ ${validatorStats.activeIds.length + validatorStats.inactiveIds.length} | 🚫 ${validatorStats.slashedIds.length} | 🔚 ${validatorStats.exitedIds.length}`
    : `🟢 ${validatorStats.activeIds.length} | 🟡 ${validatorStats.inactiveIds.length} | 🚫 ${validatorStats.slashedIds.length} | 🔚 ${validatorStats.exitedIds.length}`;

  const mainStats = [
    `*Last 1h performance:* ${performance == null ? '-' : `${performance.toFixed(2)}%`}`,
    `*Bal:* ${formatNumber(balance)} ${env.BLOCKCHAIN_TOKEN_SYMBOL} $${formatNumber(balance * tokenPrice)}`,
    env.NODE_SENTINEL_CHAIN === 'gnosis'
      ? `*Claimable:* ${env.BLOCKCHAIN_TOKEN_SYMBOL}${withdrawable.total} $${withdrawable.value}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const rewardsSection = [
    `━━━━━━━━━━━━━━━━━`,
    `${formatTableColumn('', 4)}${formatTableColumn('APY%', 7)}${formatTableColumn(env.BLOCKCHAIN_CL_REWARDS_SYMBOL, 9)}${formatTableColumn(env.BLOCKCHAIN_EL_REWARDS_SYMBOL, 9)}${formatTableColumn('Total', 10)}`,
    `${formatTableColumn('*d:*', 4)}${formatTableColumn(formatNumber(stats.rewards?.daily?.apy ?? 0, 4), 7)}${formatTableColumn(formatNumber(stats.rewards?.daily?.consensus ?? 0, 3), 9)}${formatTableColumn(formatNumber(stats.rewards?.daily?.execution ?? 0, 3), 9)}${formatTableColumn(formatNumber(stats.rewards?.daily?.usd ?? 0, 4, '$'), 10)}`,
    `${formatTableColumn('*w:*', 4)}${formatTableColumn(formatNumber(stats.rewards?.weekly?.apy ?? 0, 4), 7)}${formatTableColumn(formatNumber(stats.rewards?.weekly?.consensus ?? 0, 3), 9)}${formatTableColumn(formatNumber(stats.rewards?.weekly?.execution ?? 0, 3), 9)}${formatTableColumn(formatNumber(stats.rewards?.weekly?.usd ?? 0, 4, '$'), 10)}`,

    '*m:* Indexing.',
    //`${formatTableColumn('*m:*', 4)}${formatTableColumn(formatNumber(stats.rewards?.monthly?.apy ?? 0, 4), 7)}${formatTableColumn(formatNumber(stats.rewards?.monthly?.consensus ?? 0, 3), 9)}${formatTableColumn(formatNumber(stats.rewards?.monthly?.execution ?? 0, 3), 9)}${formatTableColumn(formatNumber(stats.rewards?.monthly?.usd ?? 0, 4, '$'), 10)}`,
  ].join('\n');

  const footer = [
    `*${env.BLOCKCHAIN_TOKEN_SYMBOL}:* $${tokenPrice.toFixed(2)}`,
    `*Updated:* ${format(new Date(), 'MM/dd hh:mmaaa')} UTC`,
  ].join('\n');

  // Combine all sections with proper Markdown formatting
  const message = [
    ...(status.syncing
      ? [`${syncStatus}`, '', `\`${validatorStatus}\``]
      : [`\`${validatorStatus}\``]),
    '',
    mainStats,
    `*Extra stats:* [Validators dashboard](${env.NODE_SENTINEL_URL}/${env.NODE_SENTINEL_CHAIN}/dashboard/${loginId})`,
    rewardsSection,
    '',
    footer,
  ].join('\n');

  return escapeMarkdown(message);
}

async function updateOrSendMessage(
  chatId: number,
  messageId: number | null,
  _message: string,
): Promise<number | undefined> {
  if (messageId) {
    try {
      await editMessageText(chatId, messageId, _message, {
        parse_mode: 'MarkdownV2',
        link_preview_options: {
          is_disabled: true,
        },
      });
      return messageId;
    } catch (error) {
      if (
        error instanceof Error &&
        'description' in error &&
        error.description === TG_ERROR_SAME_MESSAGE
      ) {
        return messageId;
      }
    }
  }

  try {
    const res = await sendMessage(chatId, _message, {
      disable_notification: true,
      parse_mode: 'MarkdownV2',
      link_preview_options: {
        is_disabled: true,
      },
    });
    return res.message_id;
  } catch (error) {
    console.log('error: ', error);
    throw new AppError('Error sending message', 'TELEGRAM_INTERACTION_ERROR', error);
  }
}

export async function notifyUserStatsMessage(
  userId: bigint,
  logger: CustomLogger,
): Promise<number | undefined> {
  const { headSlot, maxSafeSlotToQuery, maxSafeEpochToQuery, syncing } = await geSlotsInfo();

  const user = await prisma.user.findUnique({
    where: { userId },
    include: { validators: true, withdrawalAddresses: true },
  });
  if (!user) {
    logger.info(`user not found`);
    return;
  }

  if (!user.validators.length) {
    logger.info(`user has no validators`);
    return;
  }

  const stats = await getUserAllStats(
    syncing,
    maxSafeSlotToQuery,
    maxSafeEpochToQuery,
    user,
    logger,
  );

  // TODO: check null values.
  if (!syncing) {
    await notifyUnderPerformance(user, stats.performance1h ?? 0);
    await notifyInactiveValidators(user, stats.validatorStats.inactiveIds);
  }

  // send message to the user
  const message = formatStatsMessage(user.loginId, stats, {
    syncing,
    headSlot,
    maxSlotToQuery: maxSafeSlotToQuery,
  });
  return await updateOrSendMessage(Number(user.chatId), Number(user.messageId), message);
}
