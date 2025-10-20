import { User, Validator, WithdrawalAddress } from '@prisma/client';
import format from 'date-fns/format';
import { formatEther } from 'ethers/lib/utils.js';
import memoizee from 'memoizee';
import ms from 'ms';

import { geSlotsInfo } from '@/src/api/slot.js';
import { getUserValidatorsInfo } from '@/src/api/user.js';
import { UserValidatorsInfo } from '@/src/apiTypes.js';
import { getPrisma } from '@/src/config/prisma.js';
import { TG_ERROR_SAME_MESSAGE, DAYS_IN_YEAR } from '@/src/constants/index.js';
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
import { epochsIn1h, getEpochFromSlot, VALIDATOR_STATUS } from '@/src/utils/beacon.js';
import { getSlotNumberFromTimestamp } from '@/src/utils/beacon.js';
import { AppError } from '@/src/utils/errors/AppError.js';
import { getWithdrawableAmountByUserId } from '@/src/utils/getWithdrawableAmountByUserId.js';
import { formatNumber } from '@/src/utils/misc.js';

const prisma = getPrisma();
const scale = BigInt(10) ** BigInt(18);
const tokenUnit = BigInt(32000000000); // TODO: move this to a env var. For ETH, it should be just 10**9

interface ValidatorByStatus {
  activeIds: number[];
  inactiveIds: number[];
  slashedIds: number[];
  exitedIds: number[];
}

interface UserStats {
  performance1h: number | null;
  balance: {
    total: string;
    value: string;
  };
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
  const [performance1h, balanceStats, tableStats, withdrawable] = await Promise.all([
    //getValidatorStatuses(user, beaconActiveValidators, missedAttestations, maxEpochToQuery),
    get1hPerformance(syncing, missedAttestations.length, beaconActiveValidators),
    getUserBalance(user.validators),
    getUserRewards(user, logger),
    getWithdrawableAmountByUserId(Number(user.id)),
  ]);

  return {
    performance1h,
    validatorStats: validatorStatuses,
    balance: {
      total: balanceStats.total,
      value: balanceStats.value,
    },
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

  const total = Number(totalBalance) / Number(tokenUnit);

  return {
    total: total.toFixed(2),
    value: (total * tokenPrice).toFixed(0),
  };
}

// Update calculateTableStats to include weekly stats
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

  if (!dailyValidatorStats.length) {
    return null;
  }

  // Calculate daily stats (existing code)
  const totalDailyConsensus =
    BigInt(dailyValidatorStats[0].head) +
    BigInt(dailyValidatorStats[0].target) +
    BigInt(dailyValidatorStats[0].source) +
    BigInt(dailyValidatorStats[0].inactivity) +
    BigInt(dailyValidatorStats[0].syncCommittee) +
    BigInt(dailyValidatorStats[0].blockReward);

  const totalDailyConsensusInWei = (BigInt(totalDailyConsensus) * scale) / tokenUnit;
  const totalDailyConsensusEth = Number(formatEther(totalDailyConsensusInWei.toString()));
  const totalDailyExecution = Number(formatEther(dailyExecutionRewards[0].total.toString()));
  const totalDailyUsd =
    totalDailyConsensusEth * tokenPrice +
    (env.BLOCKCHAIN_FEE_REWARDS_IN_STABLE ? totalDailyExecution : totalDailyExecution * tokenPrice);

  // Calculate weekly stats
  const totalWeeklyConsensus =
    BigInt(weeklyValidatorStats[0].head) +
    BigInt(weeklyValidatorStats[0].target) +
    BigInt(weeklyValidatorStats[0].source) +
    BigInt(weeklyValidatorStats[0].inactivity) +
    BigInt(weeklyValidatorStats[0].syncCommittee) +
    BigInt(weeklyValidatorStats[0].blockReward);

  const totalWeeklyConsensusInWei = (BigInt(totalWeeklyConsensus) * scale) / tokenUnit;
  const totalWeeklyConsensusEth = Number(formatEther(totalWeeklyConsensusInWei.toString()));
  const totalWeeklyExecution = Number(formatEther(weeklyExecutionRewards[0].total.toString()));
  const totalWeeklyUsd =
    totalWeeklyConsensusEth * tokenPrice +
    (env.BLOCKCHAIN_FEE_REWARDS_IN_STABLE
      ? totalWeeklyExecution
      : totalWeeklyExecution * tokenPrice);

  const totalMonthlyConsensus =
    BigInt(monthlyValidatorStats[0].head) +
    BigInt(monthlyValidatorStats[0].target) +
    BigInt(monthlyValidatorStats[0].source) +
    BigInt(monthlyValidatorStats[0].inactivity) +
    BigInt(monthlyValidatorStats[0].syncCommittee) +
    BigInt(monthlyValidatorStats[0].blockReward);

  const totalMonthlyConsensusInWei = (BigInt(totalMonthlyConsensus) * scale) / tokenUnit;
  const totalMonthlyConsensusEth = Number(formatEther(totalMonthlyConsensusInWei.toString()));

  const totalMonthlyExecution = Number(formatEther(monthlyExecutionRewards[0].total.toString()));

  const totalMonthlyUsd =
    totalMonthlyConsensusEth * tokenPrice +
    (env.BLOCKCHAIN_FEE_REWARDS_IN_STABLE
      ? totalMonthlyExecution
      : totalMonthlyExecution * tokenPrice);

  const totalBalance =
    Number(
      user.validators.reduce(
        (acc, validator) => acc + BigInt(validator.balance.toString()),
        BigInt(0),
      ),
    ) / Number(tokenUnit);

  // Calculate APY
  const dailyApy = calculateAPY_daily(totalBalance, totalDailyConsensusEth + totalDailyExecution);

  const weeklyApy = calculateAPY_weekly(
    totalBalance,
    totalWeeklyConsensusEth + totalWeeklyExecution, // Pasamos el total semanal directamente
  );

  const monthlyApy = calculateMonthlyAPY(
    totalBalance,
    totalMonthlyConsensusEth + totalMonthlyExecution,
  );

  return {
    daily: {
      apy: dailyApy,
      consensus: totalDailyConsensusEth,
      execution: totalDailyExecution,
      usd: totalDailyUsd,
    },
    weekly: {
      apy: weeklyApy,
      consensus: totalWeeklyConsensusEth,
      execution: totalWeeklyExecution,
      usd: totalWeeklyUsd,
    },
    monthly: {
      apy: monthlyApy,
      consensus: totalMonthlyConsensusEth,
      execution: totalMonthlyExecution,
      usd: totalMonthlyUsd,
    },
  };
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

  const dailyApy = calculateAPY_daily(Number(balance.total), stats.rewards.daily.consensus).toFixed(
    2,
  );

  const weeklyApy = calculateAPY_weekly(
    Number(balance.total),
    stats.rewards.weekly.consensus,
  ).toFixed(2);

  const monthlyApy = calculateMonthlyAPY(
    Number(balance.total),
    stats.rewards.monthly.consensus,
  ).toFixed(2);

  const mainStats = [
    `Last 1h perf: ${performance == null ? '-' : `${performance.toFixed(2)}%`}`,
    `Bal: ${balance.total} ${env.BLOCKCHAIN_TOKEN_SYMBOL} $${balance.value}`,
    `Claimable: ${withdrawable.total} ${env.BLOCKCHAIN_TOKEN_SYMBOL} $${withdrawable.value}`,
  ].join('\n');

  const rewardsSection = [
    `Stats:`,
    `-----------------------------`,
    `    APY%  ${env.BLOCKCHAIN_TOKEN_SYMBOL}   ${env.BLOCKCHAIN_FEE_REWARDS_SYMBOL}   Total`,
    `d:  ${dailyApy}  ${formatNumber(stats.rewards.daily.consensus, 3)}  ${formatNumber(stats.rewards.daily.execution, 3)}  ${formatNumber(stats.rewards.daily.usd, 4, '$')}`,
    `w:  ${weeklyApy}  ${formatNumber(stats.rewards.weekly.consensus, 3)}  ${formatNumber(stats.rewards.weekly.execution, 3)}  ${formatNumber(stats.rewards.weekly.usd, 4, '$')}`,
    `m:  ${monthlyApy}  ${formatNumber(stats.rewards.monthly.consensus, 3)}  ${formatNumber(stats.rewards.monthly.execution, 3)}  ${formatNumber(stats.rewards.monthly.usd, 4, '$')}`,
  ].join('\n');

  const footer = [
    `${env.BLOCKCHAIN_TOKEN_SYMBOL}: $${tokenPrice.toFixed(2)}`,
    `Updated: ${format(new Date(), 'MM/dd hh:mmaaa')} UTC`,
  ].join('\n');

  // Combine all sections with proper HTML formatting
  return [
    ...(status.syncing
      ? [`${syncStatus}`, '', `<code>${validatorStatus}</code>`]
      : [`<code>${validatorStatus}</code>`]),
    '', // empty line
    `<pre language="c++">`,
    mainStats,
    '', // empty line
    rewardsSection,
    '', // empty line
    footer,
    `</pre>`,
    '', // empty line
    `📊 <a href="${env.NODE_SENTINEL_URL}/${env.NODE_SENTINEL_CHAIN}/dashboard/${loginId}">View full Dashboard</a>`,
  ].join('\n');
}

async function updateOrSendMessage(
  chatId: number,
  messageId: number | null,
  _message: string,
): Promise<number | undefined> {
  //const message = `${_message}\n\n<a href="t.me/node_sentinel">Feedback & Support</a>`;
  if (messageId) {
    try {
      await editMessageText(chatId, messageId, _message, {
        parse_mode: 'HTML',
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
      parse_mode: 'HTML',
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
