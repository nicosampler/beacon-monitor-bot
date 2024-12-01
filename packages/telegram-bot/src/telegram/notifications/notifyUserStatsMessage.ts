import format from "date-fns/format";
import { formatEther } from "ethers/lib/utils.js";
import { bot } from "@/src/config/index.js";
import { getPrisma } from "@/src/config/prisma.js";
import { tokenPrice } from "@/src/scheduler/tasks/tokenPriceTask.js";
import { sendMessage } from "@/src/telegram/utils/messaging.js";
import {
  epochsIn1h,
  epochsInDay,
  formatNumber,
  getEpochFromSlot,
  getEpochSlots,
  slotsIn1h,
  VALIDATOR_STATUS,
} from "@/src/utils/misc.js";
import { AppError } from "@/src/utils/errors/AppError.js";
import { getWithdrawableAmountByUserId } from "@/src/utils/getWithdrawableAmountByUserId.js";
import { getSlotNumberFromTimestamp } from "@/src/utils/time.js";
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

const prisma = getPrisma();
const tokenUnit = 32000000000; // TODO: move to env file

interface ValidatorByStatus {
  activeIds: number[];
  inactiveIds: number[];
  slashedIds: number[];
  exitedIds: number[];
}

interface UserStats {
  performance: string;
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
    daily: {
      performance: string;
      consensus: string;
      execution: string;
      usd: string;
    } | null;
    weekly: {
      performance: string;
      consensus: string;
      execution: string;
      usd: string;
    } | null;
    monthly: {
      performance: string;
      consensus: string;
      execution: string;
      usd: string;
    } | null;
  } | null;
  validatorStats: ValidatorByStatus;
}

async function slotsInfo() {
  const currentSlot = getSlotNumberFromTimestamp(new Date().getTime());
  const headSlot = currentSlot - Number(process.env.BEACON_DELAY_SLOTS_TO_HEAD);
  const lastSlotProcessed = await prisma.slot.findFirst({
    where: { attestationsFetched: true },
    orderBy: { slot: "desc" },
  });
  const epochFromLastSlotProcessed = getEpochFromSlot(lastSlotProcessed.slot);
  const maxSlotToQuery =
    getEpochSlots(epochFromLastSlotProcessed).startSlot - 1;

  // Bot is syncing if the last slot processed is one slot behind the max slot to query
  let syncing = false;
  if (headSlot - maxSlotToQuery > Number(process.env.BEACON_SLOTS_PER_EPOCH)) {
    syncing = true;
  }

  return { headSlot, maxSlotToQuery, syncing };
}

async function getUser(userId: bigint) {
  return await prisma.user.findUnique({
    where: { userId },
    include: { validators: true, withdrawalAddresses: true },
  });
}

export async function notifyUserStatsMessage(
  userId: bigint,
  logger: CustomLogger
): Promise<number | undefined> {
  const { headSlot, maxSlotToQuery, syncing } = await slotsInfo();

  logger.info(`db full user`);
  const user = await getUser(userId);
  logger.info(`db full user done`);

  const stats = await getUserAllStats(syncing, maxSlotToQuery, user, logger);

  // send message to the user
  const message = formatStatsMessage(stats, {
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

function getValidatorStatuses(
  user: User & { validators: Validator[] },
  beaconActiveValidators: Validator[],
  userMissedAttestations: Committee[],
  maxSlotToQuery: number
): ValidatorByStatus {
  const lastEpoch = getEpochFromSlot(maxSlotToQuery);

  const inactiveIds: number[] = [];
  for (const validator of beaconActiveValidators) {
    // filter missed attestations for this validator
    const recentMissed = userMissedAttestations
      .filter((entry) => entry.validatorIndex === validator.id)
      .slice(0, user.attestationThreshold)
      .map((entry) => getEpochFromSlot(entry.slot));

    // Skip if not enough missed attestations
    // or if the last epoch is not in the recent missed
    if (
      recentMissed.length < user.attestationThreshold ||
      !recentMissed.includes(lastEpoch)
    ) {
      continue;
    }

    // check if the epochs are consecutive
    const missedConsecutiveEpochs = recentMissed.every(
      (epoch, index) => epoch === recentMissed[0] - index
    );

    if (missedConsecutiveEpochs) {
      inactiveIds.push(validator.id);
    }
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
  logger.info(`beacon active validators: ${beaconActiveValidators.length}`);

  logger.info(`get missed attestations`);
  const missedAttestations = await getMissedAttestations(
    Number(user.id),
    maxSlotToQuery
  );
  logger.info(`get missed attestations done`);

  const [
    validatorStatuses,
    performance,
    balanceStats,
    rewardsStats,
    withdrawable,
  ] = await Promise.all([
    getValidatorStatuses(
      user,
      beaconActiveValidators,
      missedAttestations,
      maxSlotToQuery
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
    performance,
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
    rewards: rewardsStats,
  };
}

async function get1hPerformance(
  syncing: boolean,
  missedAttestations: Committee[],
  userActiveValidators: number
) {
  if (syncing) return "0";

  const expectedAttestations = epochsIn1h * userActiveValidators;
  if (expectedAttestations === 0) return "0";

  const performancePercentage = (
    ((expectedAttestations - missedAttestations.length) /
      expectedAttestations) *
    100
  ).toFixed(2);

  return performancePercentage;
}

function getUserBalance(validators: Validator[]) {
  const totalBalance = validators.reduce(
    (acc, validator) => acc + BigInt(validator.balance.toString()),
    BigInt(0)
  );

  const total = Number(totalBalance) / tokenUnit;

  return {
    total: total.toFixed(2),
    value: (total * tokenPrice).toFixed(0),
  };
}

async function calculateTableStats(
  user: User & { validators: Validator[] },
  logger: CustomLogger
) {
  const validatorStatsDailyQuery = `
    SELECT 
      COALESCE(SUM(head), 0) as head,
      COALESCE(SUM(target), 0) as target,
      COALESCE(SUM(source), 0) as source,
      COALESCE(SUM(inactivity), 0) as inactivity,
      COALESCE(SUM("attestationsMissed"), 0) as "attestationsMissed"
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

  const executionRewardsDailyQuery = `
    SELECT 
      COALESCE(SUM(her.amount), 0) as total
    FROM "HourlyExecutionRewards" her
    JOIN "_FeeRewardAddressToUser" fra ON fra."A" ilike her.address
    WHERE fra."B" = $1
      AND her.date >= NOW() - INTERVAL '24 hours'`;

  logger.info(`1d stats`);
  const [validatorStats, executionRewards] = await Promise.all([
    prisma.$queryRawUnsafe<
      {
        head: string;
        target: string;
        source: string;
        inactivity: string;
        attestationsMissed: BigInt;
      }[]
    >(validatorStatsDailyQuery, user.id),
    prisma.$queryRawUnsafe<
      {
        total: string;
      }[]
    >(executionRewardsDailyQuery, user.id),
  ]);
  logger.info(`1d stats done`);
  if (!validatorStats.length) return null;

  const totalDailyConsensus =
    BigInt(validatorStats[0].head) +
    BigInt(validatorStats[0].target) +
    BigInt(validatorStats[0].source) +
    BigInt(validatorStats[0].inactivity);

  const totalDailyConsensusInWei =
    (BigInt(totalDailyConsensus) * BigInt(1e18)) / BigInt(tokenUnit);

  const totalDailyConsensusEth = Number(
    formatEther(totalDailyConsensusInWei.toString())
  );

  const totalDailyExecution = Number(
    formatEther(executionRewards[0].total.toString())
  );

  const totalUsd =
    totalDailyConsensusEth * tokenPrice +
    (FEE_REWARDS_IN_STABLE
      ? totalDailyExecution
      : totalDailyExecution * tokenPrice);

  const performance =
    100 *
    (1 -
      Number(validatorStats[0].attestationsMissed) /
        (epochsInDay * user.validators.length));

  return {
    daily: {
      performance: formatNumber(performance, 4),
      consensus: totalDailyConsensusEth.toFixed(2),
      execution: totalDailyExecution.toFixed(2),
      usd: formatNumber(totalUsd, 3, "$"),
    },
    weekly: null,
    // {
    //   performance: "0",
    //   consensus: "0",
    //   execution: "0",
    //   usd: formatNumber(0, 4, "$"),
    // },
    monthly: null,
    // {
    //   performance: "0",
    //   consensus: "0",
    //   execution: "0",
    //   usd: formatNumber(0, 4, "$"),
    // },
  };
}

function calculateAPY(totalBalance: number, monthlyRewards: number): number {
  if (!totalBalance || !monthlyRewards) return 0;
  return (
    ((1 + monthlyRewards / totalBalance) ** (DAYS_IN_YEAR / DAYS_IN_MONTH) -
      1) *
    100
  );
}

function formatStatsMessage(
  stats: UserStats,
  status: {
    syncing: boolean;
    headSlot: number;
    maxSlotToQuery: number;
  }
): string {
  const { performance, balance, withdrawable, validatorStats } = stats;

  const syncStatus = status.syncing
    ? `⚠️ ${status.headSlot - status.maxSlotToQuery} slots behind ⚠️`
    : null;

  // Define message sections
  const validatorStatus = status.syncing
    ? `⚪️ ${validatorStats.activeIds.length + validatorStats.inactiveIds.length} | 🚫 ${validatorStats.slashedIds.length} | 🔚 ${validatorStats.exitedIds.length}`
    : `🟢 ${validatorStats.activeIds.length} | 🟡 ${validatorStats.inactiveIds.length} | 🚫 ${validatorStats.slashedIds.length} | 🔚 ${validatorStats.exitedIds.length}`;

  const mainStats = [
    `Last 1h perf: ${status.syncing ? "(needs sync)" : `${performance}%`}`,
    `Bal: ${balance.total} ${TOKEN_SYMBOL} $${balance.value}`,
    `APY: 🔜`,
    `Claimable: ${withdrawable.total} ${TOKEN_SYMBOL} $${withdrawable.value}`,
  ].join("\n");

  const rewardsSection = [
    `Stats:`,
    `---------------------------`,
    `   perf%   ${TOKEN_SYMBOL}  ${FEE_REWARDS_SYMBOL}  Total`,
    `d: ${stats.rewards.daily.performance}  ${stats.rewards.daily.consensus}  ${stats.rewards.daily.execution}  ${stats.rewards.daily.usd}`,
    `w:            🔜`,
    `m:            🔜`,
  ].join("\n");

  const footer = [
    `${TOKEN_SYMBOL}: $${tokenPrice.toFixed(2)}`,
    `Updated: ${format(new Date(), "MM/dd hh:mmaaa")} UTC`,
  ].join("\n");

  // Combine all sections
  return `\`${[
    ...(status.syncing ? [syncStatus, "", validatorStatus] : [validatorStatus]),
    "", // empty line
    mainStats,
    "", // empty line
    rewardsSection,
    "", // empty line
    footer,
  ].join("\n")}\``;
}

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

async function updateOrSendMessage(
  chatId: number,
  messageId: number | null,
  message: string
): Promise<number | undefined> {
  if (messageId) {
    try {
      await bot.api.editMessageText(chatId, messageId, message, {
        parse_mode: "MarkdownV2",
      });
      return messageId;
    } catch (error: any) {
      if (error.description === TG_ERROR_SAME_MESSAGE) {
        return messageId;
      }
    }
  }

  try {
    const res = await sendMessage(chatId, message, {
      disable_notification: true,
      parse_mode: "MarkdownV2",
    });
    return res.message_id;
  } catch (error) {
    throw new AppError(
      "Error editing message",
      "TELEGRAM_INTERACTION_ERROR",
      error
    );
  }
}
