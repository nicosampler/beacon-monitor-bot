import format from "date-fns/format";
import { formatEther } from "ethers/lib/utils.js";
import { bot } from "@/src/config/index.js";
import { getPrisma } from "@/src/config/prisma.js";
import { tokenPrice } from "@/src/scheduler/tasks/tokenPriceTask.js";
import {
  editMessageText,
  sendMessage,
} from "@/src/telegram/utils/messaging.js";
import { formatNumber } from "@/src/utils/misc.js";
import {
  epochsIn1h,
  getEpochFromSlot,
  getEpochSlots,
  slotsIn1h,
  VALIDATOR_STATUS,
} from "@/src/utils/beacon.js";
import { AppError } from "@/src/utils/errors/AppError.js";
import { getWithdrawableAmountByUserId } from "@/src/utils/getWithdrawableAmountByUserId.js";
import { getSlotNumberFromTimestamp } from "@/src/utils/beacon.js";
import {
  TOKEN_SYMBOL,
  FEE_REWARDS_IN_STABLE,
  FEE_REWARDS_SYMBOL,
  TG_ERROR_SAME_MESSAGE,
  DAYS_IN_YEAR,
  DAYS_IN_MONTH,
} from "@/src/constants/index.js";
import { Committee, User, Validator, WithdrawalAddress } from "@prisma/client";
import { CustomLogger } from "@/src/lib/pino.js";
import { notifyUnderPerformance } from "@/src/scheduler/tasks/notifyUnderPerformance.js";
import { notifyInactiveValidators } from "@/src/scheduler/tasks/notifyInactiveValidators.js";
import memoizee from "memoizee";
import ms from "ms";
import { env } from "@/src/env.js";
import {
  getMonthlyExecutionRewardsMemoized,
  getMonthlyValidatorStatsMemoized,
} from "@/src/scheduler/tasks/utils/monthly.js";

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

async function slotsInfo() {
  const currentSlot = getSlotNumberFromTimestamp(new Date().getTime());

  const headSlot = currentSlot - Number(process.env.BEACON_DELAY_SLOTS_TO_HEAD);
  const headEpoch = getEpochFromSlot(headSlot);
  const headEpochSlots = getEpochSlots(headEpoch);

  const maxSlotToQuery =
    headEpochSlots.startSlot - 1 - env.BEACON_SLOTS_PER_EPOCH;

  const lastSlotProcessed = await prisma.slot.findFirst({
    where: { attestationsFetched: true },
    orderBy: { slot: "desc" },
  });

  // The bot is syncing if the last slot processed is less than
  // one complete epoch behind the head epoch
  const syncing = (lastSlotProcessed?.slot || 0) < maxSlotToQuery;

  return {
    headSlot,
    maxSlotToQuery,
    maxEpochToQuery: getEpochFromSlot(maxSlotToQuery),
    syncing,
  };
}

async function getUser(userId: bigint) {
  return await prisma.user.findUnique({
    where: { userId },
    include: { validators: true, withdrawalAddresses: true },
  });
}

function getValidatorStatuses(
  user: User & { validators: Validator[] },
  beaconActiveValidators: Validator[],
  userMissedAttestations: Committee[],
  maxEpochToQuery: number
): ValidatorByStatus {
  const inactiveIds: number[] = [];
  for (const validator of beaconActiveValidators) {
    // get the last missed attestations for each validator
    const recentMissed = userMissedAttestations
      .filter((entry) => entry.validatorIndex === validator.id)
      .slice(0, user.inactiveOnMissedAttestations)
      .map((entry) => getEpochFromSlot(entry.slot))
      .filter(
        // Get the last N epochs where N is the user's inactivity threshold.
        // Each validator attest once per epoch.
        (epoch) => epoch > maxEpochToQuery - user.inactiveOnMissedAttestations
      );

    // Skip if not enough missed attestations
    if (recentMissed.length < user.inactiveOnMissedAttestations) {
      continue;
    }

    inactiveIds.push(validator.id);
  }

  const activeIds = beaconActiveValidators
    .filter((v) => !inactiveIds.includes(v.id))
    .map((v) => v.id);

  return {
    activeIds,
    inactiveIds,
    slashedIds: user.validators
      .filter(
        (v) =>
          v.status === VALIDATOR_STATUS.active_slashed ||
          v.status === VALIDATOR_STATUS.exited_slashed
      )
      .map((v) => v.id),
    exitedIds: user.validators
      .filter(
        (v) =>
          v.status === VALIDATOR_STATUS.exited_unslashed ||
          v.status === VALIDATOR_STATUS.withdrawal_done
      )
      .map((v) => v.id),
  };
}

async function getUserAllStats(
  syncing: boolean,
  maxSlotToQuery: number,
  maxEpochToQuery: number,
  user: User & {
    validators: Validator[];
    withdrawalAddresses: WithdrawalAddress[];
  },
  logger: CustomLogger
): Promise<UserStats> {
  const beaconActiveValidators = user.validators.filter(
    (v) =>
      v.status === VALIDATOR_STATUS.active_ongoing ||
      v.status === VALIDATOR_STATUS.active_exiting
  );

  const missedAttestations = await getMissedAttestations(
    Number(user.id),
    maxSlotToQuery
  );

  const [
    validatorStatuses,
    performance1h,
    balanceStats,
    tableStats,
    withdrawable,
  ] = await Promise.all([
    getValidatorStatuses(
      user,
      beaconActiveValidators,
      missedAttestations,
      maxEpochToQuery
    ),
    get1hPerformance(
      syncing,
      missedAttestations,
      beaconActiveValidators.length
    ),
    getUserBalance(user.validators),
    calculateTableStats(user, logger),
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
  missedAttestations: Committee[],
  userActiveValidators: number
) {
  if (syncing) return null;

  if (!userActiveValidators) return null;
  const expectedAttestations = epochsIn1h * userActiveValidators;

  const performancePercentage =
    ((expectedAttestations - missedAttestations.length) /
      expectedAttestations) *
    100;

  return performancePercentage;
}

function getUserBalance(validators: Validator[]) {
  const totalBalance = validators.reduce(
    (acc, validator) => acc + BigInt(validator.balance.toString()),
    BigInt(0)
  );

  const total = Number(totalBalance) / Number(tokenUnit);

  return {
    total: total.toFixed(2),
    value: (total * tokenPrice).toFixed(0),
  };
}

// Get all the missed attestations in the last hour for the user's validators
async function getMissedAttestations(
  userId: number,
  maxSlotToQuery: number
): Promise<Committee[]> {
  return prisma.$queryRaw<Committee[]>`
    WITH slots AS (
      SELECT ${maxSlotToQuery - slotsIn1h} as slot_start, ${maxSlotToQuery} as slot_end
    ),
    active_validators AS MATERIALIZED (
      SELECT v.id
      FROM "_UserToValidator" uv 
      JOIN "Validator" v ON v.id = uv."B"
      WHERE uv."A" = ${userId}
      AND v.status IN (${VALIDATOR_STATUS.active_ongoing}, ${VALIDATOR_STATUS.active_exiting})
    )
    SELECT c.* 
    FROM active_validators av
    CROSS JOIN slots s
    JOIN LATERAL (
      SELECT *
      FROM "Committee" c
      WHERE c."validatorIndex" = av.id
      AND c.slot BETWEEN s.slot_start AND s.slot_end
      AND (
        c."attestationDelay" IS NULL 
        OR c."attestationDelay" > ${Number(process.env.BEACON_MAX_ATTESTATION_DELAY)}
      )
    ) c ON true
    ORDER BY c.slot DESC
  `;
}

// Memoized version of getDailyValidatorStats
const getDailyValidatorStatsMemoized = memoizee(
  async (userId: number) => {
    // Query to get validator stats for the last 24 hours
    const query = `
      SELECT 
        COALESCE(SUM(head), 0) as head,
        COALESCE(SUM(target), 0) as target,
        COALESCE(SUM(source), 0) as source,
        COALESCE(SUM(inactivity), 0) as inactivity,
        COALESCE(SUM("attestationsMissed"), 0) as "attestationsMissed",
        COALESCE(SUM("syncCommittee"), 0) as "syncCommittee",
        COALESCE(SUM("blockReward"), 0) as "blockReward"
      FROM "HourlyValidatorStats" hvs
      JOIN "_UserToValidator" uv ON uv."B" = hvs."validatorIndex"
      JOIN "Validator" v ON v.id = uv."B"
      WHERE uv."A" = $1
        AND v.status IN (2, 3)
        AND (
          -- Today's records up to current hour
          (hvs.date = CURRENT_DATE AND hvs.hour <= EXTRACT(HOUR FROM NOW()))
          OR
          -- Yesterday's records after current hour
          (hvs.date = CURRENT_DATE - INTERVAL '1 day' AND hvs.hour > EXTRACT(HOUR FROM NOW()))
        )`;

    return await prisma.$queryRawUnsafe<
      {
        head: string;
        target: string;
        source: string;
        inactivity: string;
        syncCommittee: string;
        blockReward: string;
        attestationsMissed: BigInt;
      }[]
    >(query, userId);
  },
  { promise: true, maxAge: ms("15m") }
);

// Memoized version of getDailyExecutionRewards
const getDailyExecutionRewardsMemoized = memoizee(
  async (userId: number) => {
    // Query to get execution rewards for the last 24 hours
    const query = `
      SELECT 
        COALESCE(SUM(her.amount), 0) as total
      FROM "HourlyExecutionRewards" her
      JOIN "_FeeRewardAddressToUser" fra ON fra."A" ilike her.address
      WHERE fra."B" = $1
      AND (
          -- Today's records up to current hour
          (her.date = CURRENT_DATE AND her.hour <= EXTRACT(HOUR FROM NOW()))
          OR
          -- Yesterday's records after current hour
          (her.date = CURRENT_DATE - INTERVAL '1 day' AND her.hour > EXTRACT(HOUR FROM NOW()))
      )`;

    return await prisma.$queryRawUnsafe<
      {
        total: string;
      }[]
    >(query, userId);
  },
  { promise: true, maxAge: ms("15m") }
);

// Memoized version of getWeeklyValidatorStats
const getWeeklyValidatorStatsMemoized = memoizee(
  async (userId: number) => {
    const query = `
      WITH last_date AS (
        SELECT MAX(date) as max_date
        FROM "DailyValidatorStats"
      )
      SELECT 
        COALESCE(SUM(head), 0) as head,
        COALESCE(SUM(target), 0) as target,
        COALESCE(SUM(source), 0) as source,
        COALESCE(SUM(inactivity), 0) as inactivity,
        COALESCE(SUM("attestationsMissed"), 0) as "attestationsMissed",
        COALESCE(SUM("syncCommittee"), 0) as "syncCommittee",
        COALESCE(SUM("blockReward"), 0) as "blockReward"
      FROM "DailyValidatorStats" dvs
      JOIN "_UserToValidator" uv ON uv."B" = dvs."validatorIndex"
      JOIN "Validator" v ON v.id = uv."B"
      CROSS JOIN last_date ld
      WHERE uv."A" = $1
        AND v.status IN (2, 3)
        AND dvs.date <= ld.max_date
        AND dvs.date > ld.max_date - INTERVAL '7 days'`;

    return await prisma.$queryRawUnsafe<
      {
        head: string;
        target: string;
        source: string;
        inactivity: string;
        syncCommittee: string;
        blockReward: string;
        attestationsMissed: BigInt;
      }[]
    >(query, userId);
  },
  { promise: true, maxAge: ms("1h") }
);

// Memoized version of getWeeklyExecutionRewards
const getWeeklyExecutionRewardsMemoized = memoizee(
  async (userId: number) => {
    const query = `
      WITH last_date AS (
        SELECT MAX(date) as max_date
        FROM "DailyExecutionRewards"
      )
      SELECT 
        COALESCE(SUM(der.amount), 0) as total
      FROM "DailyExecutionRewards" der
      JOIN "_FeeRewardAddressToUser" fra ON fra."A" ilike der.address
      CROSS JOIN last_date ld
      WHERE fra."B" = $1
        AND der.date <= ld.max_date
        AND der.date > ld.max_date - INTERVAL '7 days'`;

    return await prisma.$queryRawUnsafe<
      {
        total: string;
      }[]
    >(query, userId);
  },
  { promise: true, maxAge: ms("1h") }
);

// Update calculateTableStats to include weekly stats
async function calculateTableStats(
  user: User & { validators: Validator[] },
  logger: CustomLogger
): Promise<UserStats["rewards"]> {
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

  if (!dailyValidatorStats.length) return null;

  // Calculate daily stats (existing code)
  const totalDailyConsensus =
    BigInt(dailyValidatorStats[0].head) +
    BigInt(dailyValidatorStats[0].target) +
    BigInt(dailyValidatorStats[0].source) +
    BigInt(dailyValidatorStats[0].inactivity) +
    BigInt(dailyValidatorStats[0].syncCommittee) +
    BigInt(dailyValidatorStats[0].blockReward);

  const totalDailyConsensusInWei =
    (BigInt(totalDailyConsensus) * scale) / tokenUnit;
  const totalDailyConsensusEth = Number(
    formatEther(totalDailyConsensusInWei.toString())
  );
  const totalDailyExecution = Number(
    formatEther(dailyExecutionRewards[0].total.toString())
  );
  const totalDailyUsd =
    totalDailyConsensusEth * tokenPrice +
    (FEE_REWARDS_IN_STABLE
      ? totalDailyExecution
      : totalDailyExecution * tokenPrice);

  // Calculate weekly stats
  const totalWeeklyConsensus =
    BigInt(weeklyValidatorStats[0].head) +
    BigInt(weeklyValidatorStats[0].target) +
    BigInt(weeklyValidatorStats[0].source) +
    BigInt(weeklyValidatorStats[0].inactivity) +
    BigInt(weeklyValidatorStats[0].syncCommittee) +
    BigInt(weeklyValidatorStats[0].blockReward);

  const totalWeeklyConsensusInWei =
    (BigInt(totalWeeklyConsensus) * scale) / tokenUnit;
  const totalWeeklyConsensusEth = Number(
    formatEther(totalWeeklyConsensusInWei.toString())
  );
  const totalWeeklyExecution = Number(
    formatEther(weeklyExecutionRewards[0].total.toString())
  );
  const totalWeeklyUsd =
    totalWeeklyConsensusEth * tokenPrice +
    (FEE_REWARDS_IN_STABLE
      ? totalWeeklyExecution
      : totalWeeklyExecution * tokenPrice);

  const totalMonthlyConsensus =
    BigInt(monthlyValidatorStats[0].head) +
    BigInt(monthlyValidatorStats[0].target) +
    BigInt(monthlyValidatorStats[0].source) +
    BigInt(monthlyValidatorStats[0].inactivity) +
    BigInt(monthlyValidatorStats[0].syncCommittee) +
    BigInt(monthlyValidatorStats[0].blockReward);

  const totalMonthlyConsensusInWei =
    (BigInt(totalMonthlyConsensus) * scale) / tokenUnit;
  const totalMonthlyConsensusEth = Number(
    formatEther(totalMonthlyConsensusInWei.toString())
  );

  const totalMonthlyExecution = Number(
    formatEther(monthlyExecutionRewards[0].total.toString())
  );

  const totalMonthlyUsd =
    totalMonthlyConsensusEth * tokenPrice +
    (FEE_REWARDS_IN_STABLE
      ? totalMonthlyExecution
      : totalMonthlyExecution * tokenPrice);

  const totalBalance =
    Number(
      user.validators.reduce(
        (acc, validator) => acc + BigInt(validator.balance.toString()),
        BigInt(0)
      )
    ) / Number(tokenUnit);

  // Calculate APY
  const dailyApy = calculateAPY_daily(
    totalBalance,
    totalDailyConsensusEth + totalDailyExecution
  );

  const weeklyApy = calculateAPY_weekly(
    totalBalance,
    totalWeeklyConsensusEth + totalWeeklyExecution // Pasamos el total semanal directamente
  );

  const monthlyApy = calculateMonthlyAPY(
    totalBalance,
    totalMonthlyConsensusEth + totalMonthlyExecution
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

function calculateAPY_daily(
  totalBalance: number,
  dailyRewards: number
): number {
  if (!totalBalance || !dailyRewards) return 0;
  return ((1 + dailyRewards / totalBalance) ** DAYS_IN_YEAR - 1) * 100;
}

function calculateAPY_weekly(
  totalBalance: number,
  weeklyRewards: number
): number {
  if (!totalBalance || !weeklyRewards) return 0;
  return ((1 + weeklyRewards / totalBalance) ** (DAYS_IN_YEAR / 7) - 1) * 100;
}

function calculateMonthlyAPY(
  totalBalance: number,
  monthlyRewards: number
): number {
  if (!totalBalance || !monthlyRewards) return 0;
  return ((1 + monthlyRewards / totalBalance) ** (DAYS_IN_YEAR / 30) - 1) * 100;
}

function formatStatsMessage(
  loginId: string,
  stats: UserStats,
  status: {
    syncing: boolean;
    headSlot: number;
    maxSlotToQuery: number;
  }
): string {
  const {
    performance1h: performance,
    balance,
    withdrawable,
    validatorStats,
  } = stats;

  const syncStatus = status.syncing
    ? `⚠️ ${status.headSlot - status.maxSlotToQuery} slots behind ⚠️`
    : null;

  // Define message sections
  const validatorStatus = status.syncing
    ? `⚪️ ${validatorStats.activeIds.length + validatorStats.inactiveIds.length} | 🚫 ${validatorStats.slashedIds.length} | 🔚 ${validatorStats.exitedIds.length}`
    : `🟢 ${validatorStats.activeIds.length} | 🟡 ${validatorStats.inactiveIds.length} | 🚫 ${validatorStats.slashedIds.length} | 🔚 ${validatorStats.exitedIds.length}`;

  const dailyApy = calculateAPY_daily(
    Number(balance.total),
    stats.rewards.daily.consensus
  ).toFixed(2);

  const weeklyApy = calculateAPY_weekly(
    Number(balance.total),
    stats.rewards.weekly.consensus
  ).toFixed(2);

  const monthlyApy = calculateMonthlyAPY(
    Number(balance.total),
    stats.rewards.monthly.consensus
  ).toFixed(2);

  const mainStats = [
    `Last 1h perf: ${performance == null ? "-" : `${performance.toFixed(2)}%`}`,
    `Bal: ${balance.total} ${TOKEN_SYMBOL} $${balance.value}`,
    `Claimable: ${withdrawable.total} ${TOKEN_SYMBOL} $${withdrawable.value}`,
  ].join("\n");

  const rewardsSection = [
    `Stats:`,
    `-----------------------------`,
    `    APY%  ${TOKEN_SYMBOL}   ${FEE_REWARDS_SYMBOL}   Total`,
    `d:  ${dailyApy}  ${formatNumber(stats.rewards.daily.consensus, 3)}  ${formatNumber(stats.rewards.daily.execution, 3)}  ${formatNumber(stats.rewards.daily.usd, 4, "$")}`,
    `w:  ${weeklyApy}  ${formatNumber(stats.rewards.weekly.consensus, 3)}  ${formatNumber(stats.rewards.weekly.execution, 3)}  ${formatNumber(stats.rewards.weekly.usd, 4, "$")}`,
    `m:  ${monthlyApy}  ${formatNumber(stats.rewards.monthly.consensus, 3)}  ${formatNumber(stats.rewards.monthly.execution, 3)}  ${formatNumber(stats.rewards.monthly.usd, 4, "$")}`,
  ].join("\n");

  const footer = [
    `${TOKEN_SYMBOL}: $${tokenPrice.toFixed(2)}`,
    `Updated: ${format(new Date(), "MM/dd hh:mmaaa")} UTC`,
  ].join("\n");

  // Combine all sections with proper HTML formatting
  return [
    ...(status.syncing
      ? [`${syncStatus}`, "", `<code>${validatorStatus}</code>`]
      : [`<code>${validatorStatus}</code>`]),
    "", // empty line
    `<pre language="c++">`,
    mainStats,
    "", // empty line
    rewardsSection,
    "", // empty line
    footer,
    `</pre>`,
    "", // empty line
    `📊 <a href="${process.env.NODE_SENTINEL_URL}/${env.NODE_SENTINEL_CHAIN}/dashboard/${loginId}">View full Dashboard</a>`,
  ].join("\n");
}

async function updateOrSendMessage(
  chatId: number,
  messageId: number | null,
  _message: string
): Promise<number | undefined> {
  //const message = `${_message}\n\n<a href="t.me/node_sentinel">Feedback & Support</a>`;
  if (messageId) {
    try {
      await editMessageText(chatId, messageId, _message, {
        parse_mode: "HTML",
        link_preview_options: {
          is_disabled: true,
        },
      });
      return messageId;
    } catch (error: any) {
      if (error.description === TG_ERROR_SAME_MESSAGE) {
        return messageId;
      }
    }
  }

  try {
    const res = await sendMessage(chatId, _message, {
      disable_notification: true,
      parse_mode: "HTML",
      link_preview_options: {
        is_disabled: true,
      },
    });
    return res.message_id;
  } catch (error) {
    console.log("error: ", error);
    throw new AppError(
      "Error sending message",
      "TELEGRAM_INTERACTION_ERROR",
      error
    );
  }
}

export async function notifyUserStatsMessage(
  userId: bigint,
  logger: CustomLogger
): Promise<number | undefined> {
  const { headSlot, maxSlotToQuery, maxEpochToQuery, syncing } =
    await slotsInfo();

  logger.info(`db full user`);
  const user = await getUser(userId);
  logger.info(`db full user done`);

  const stats = await getUserAllStats(
    syncing,
    maxSlotToQuery,
    maxEpochToQuery,
    user,
    logger
  );

  // TODO: check null values.
  if (!syncing) {
    await notifyUnderPerformance(user, stats.performance1h);
    await notifyInactiveValidators(user, stats.validatorStats.inactiveIds);
  }

  // send message to the user
  const message = formatStatsMessage(user.loginId, stats, {
    syncing,
    headSlot,
    maxSlotToQuery,
  });
  return await updateOrSendMessage(
    Number(user.chatId),
    Number(user.messageId),
    message
  );
}
