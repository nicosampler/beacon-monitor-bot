import format from "date-fns/format";
import { getHours, subHours } from "date-fns";
import { formatEther } from "ethers/lib/utils.js";
import { bot } from "@/src/config/index.js";
import { getPrisma } from "@/src/config/prisma.js";
import { tokenPrice } from "@/src/scheduler/tasks/tokenPriceTask.js";
import { sendMessage } from "@/src/telegram/utils/messaging.js";
import {
  formatNumber,
  slotsInDay,
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

const prisma = getPrisma();
const tokenUnit = 32000000000; // TODO: move to env file
const BEACON_SLOT_DURATION_IN_SECONDS = Number(
  process.env.BEACON_SLOT_DURATION_IN_SECONDS
);
const slotsIn1h = 3600 / BEACON_SLOT_DURATION_IN_SECONDS;

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
    };
    weekly: {
      performance: string;
      consensus: string;
      execution: string;
      usd: string;
    };
    monthly: {
      performance: string;
      consensus: string;
      execution: string;
      usd: string;
    };
  } | null;
  validatorStats: ValidatorByStatus;
}

export async function notifyUserStatsMessage(
  userId: number
): Promise<number | undefined> {
  // get user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { validators: true, withdrawalAddresses: true },
  });

  // get head slot and last slot processed
  const headSlot = getSlotNumberFromTimestamp(new Date().getTime()) - 1;
  const lastSlotProcessed = await prisma.slot.findFirst({
    where: { attestationsFetched: true },
    orderBy: { slot: "desc" },
  });
  if (!lastSlotProcessed) return;

  // check if bot is syncing
  let syncing = false;
  if (
    headSlot - lastSlotProcessed?.slot >
    Number(process.env.BEACON_MAX_ATTESTATION_DELAY)
  ) {
    syncing = true;
  }

  // calculate user stats
  const stats = await calculateUserStats(syncing, user);

  // send message to the user
  const message = formatStatsMessage(stats, {
    syncing,
    headSlot,
    lastSlotProcessed: lastSlotProcessed.slot,
  });
  return await updateOrSendMessage(
    Number(user.chatId),
    Number(user.messageId),
    message
  );
}

function calculateValidatorStats(
  validators: Validator[],
  missedAttestations: Committee[],
  attestationThreshold: number
): ValidatorByStatus {
  // Filter validators that are "active" for the beacon chain
  const beaconActiveValidators = validators.filter(
    (v) =>
      v.status === VALIDATOR_STATUS.ACTIVE_ONGOING ||
      v.status === VALIDATOR_STATUS.ACTIVE_EXITING
  );

  // A validator is inactive if it appears in all of the last amountOfMissedAttestationsToBeInactive entries
  const lastEntries = missedAttestations.slice(0, attestationThreshold);
  const inactiveIds = beaconActiveValidators
    .map((v) => v.id)
    .filter((validatorId) =>
      lastEntries.every((entry) => entry.validatorIndex === validatorId)
    );

  // Active validators are those that are beacon active but not inactive
  const activeIds = beaconActiveValidators
    .filter((v) => !inactiveIds.includes(v.id))
    .map((v) => v.id);

  return {
    activeIds,
    inactiveIds,
    slashedIds: validators
      .filter(
        (v) =>
          v.status === VALIDATOR_STATUS.ACTIVE_SLASHED ||
          v.status === VALIDATOR_STATUS.EXITED_SLASHED
      )
      .map((v) => v.id),
    exitedIds: validators
      .filter(
        (v) =>
          v.status === VALIDATOR_STATUS.EXITED_UNSLASHED ||
          v.status === VALIDATOR_STATUS.WITHDRAWAL_DONE
      )
      .map((v) => v.id),
  };
}

async function getValidatorByStatus(user: User & { validators: Validator[] }) {
  const activeValidators = user.validators.filter(
    (v) =>
      v.status === VALIDATOR_STATUS.ACTIVE_ONGOING ||
      v.status === VALIDATOR_STATUS.ACTIVE_EXITING ||
      v.status === VALIDATOR_STATUS.PENDING_QUEUED
  );
  const missedAttestations = await getMissedAttestations(activeValidators);
  const validatorStats = calculateValidatorStats(
    user.validators,
    missedAttestations,
    user.attestationThreshold
  );

  return validatorStats;
}

async function calculateUserStats(
  syncing: boolean,
  user: User & {
    validators: Validator[];
    withdrawalAddresses: WithdrawalAddress[];
  }
): Promise<UserStats> {
  // get validator stats
  const validatorStats = await getValidatorByStatus(user);
  // calculate performance stats
  const performance = await calculatePerformanceStats(syncing, user);
  // sum all validators balance in tokens and in usd.
  const balanceStats = getUserBalance(user.validators);
  // calculate rewards stats
  const rewardsStats = await calculateRewardsStats(user);
  // get withdrawable amount
  const withdrawable = await getWithdrawableAmountByUserId(Number(user.id));

  return {
    performance,
    validatorStats,
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

async function calculatePerformanceStats(
  syncing: boolean,
  user: User & { validators: Validator[] }
) {
  if (syncing) return "0";

  const activeValidators = user.validators.filter(
    (v) =>
      v.status === VALIDATOR_STATUS.ACTIVE_ONGOING ||
      v.status === VALIDATOR_STATUS.ACTIVE_EXITING
  );

  const missedAttestations = await getMissedAttestations(activeValidators);

  const expectedAttestations = slotsIn1h * activeValidators.length;
  if (expectedAttestations === 0) return "0";
  return (
    ((expectedAttestations - missedAttestations.length) /
      expectedAttestations) *
    100
  ).toFixed(2);
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

async function calculateRewardsStats(user: User & { validators: Validator[] }) {
  const validatorStatsDailyQuery = `
    WITH last_update AS (
      SELECT "dailyValidatorStats"::timestamp as date
      FROM "LastSummaryUpdate"
      LIMIT 1
    )

    SELECT 
      COALESCE(SUM(head), 0) as head,
      COALESCE(SUM(target), 0) as target,
      COALESCE(SUM(source), 0) as source,
      COALESCE(SUM(inactivity), 0) as inactivity,
      COALESCE(SUM("attestationsMissed"), 0) as "attestationsMissed"
    FROM "HourlyValidatorStats" hvs

    CROSS JOIN last_update lu

    JOIN "_UserToValidator" uv ON uv."B" = hvs."validatorIndex"
    JOIN "Validator" v ON v.id = uv."B"

    WHERE hvs.date <= DATE(lu.date)
      AND hvs.date >= DATE(lu.date - INTERVAL '1 day')
      AND uv."A" = $1
      AND v.status IN ('pending_queued', 'active_ongoing', 'active_exiting', 'active_slashed')`;

  const validatorStatsDailyResults = await prisma.$queryRawUnsafe<
    {
      head: string;
      target: string;
      source: string;
      inactivity: string;
      attestationsMissed: BigInt;
    }[]
  >(validatorStatsDailyQuery, user.id);

  if (!validatorStatsDailyResults.length) return null;

  const totalDailyConsensus =
    BigInt(validatorStatsDailyResults[0].head) +
    BigInt(validatorStatsDailyResults[0].target) +
    BigInt(validatorStatsDailyResults[0].source) +
    BigInt(validatorStatsDailyResults[0].inactivity);

  const totalDailyConsensusInWei =
    (BigInt(totalDailyConsensus) * BigInt(1e18)) / BigInt(tokenUnit);

  const totalDailyConsensusEth = Number(
    formatEther(totalDailyConsensusInWei.toString())
  );

  const executionRewardsDailyQuery = `
    WITH last_update AS (
      SELECT "dailyValidatorStats"::timestamp as date
      FROM "LastSummaryUpdate"
      LIMIT 1
    )

    SELECT 
      COALESCE(SUM(her.amount), 0) as total
    FROM "HourlyExecutionRewards" her
    CROSS JOIN last_update lu
    JOIN "_FeeRewardAddressToUser" fra ON fra."A" = her.address
    WHERE her.date <= DATE(lu.date)
      AND her.date >= DATE(lu.date - INTERVAL '1 day')
      AND fra."B" = $1`;

  const executionResults = await prisma.$queryRawUnsafe<{ total: string }[]>(
    executionRewardsDailyQuery,
    user.id
  );

  const totalDailyExecution = Number(
    formatEther(executionResults[0].total.toString())
  );

  const totalUsd =
    totalDailyConsensusEth * tokenPrice +
    (FEE_REWARDS_IN_STABLE
      ? totalDailyExecution
      : totalDailyExecution * tokenPrice);

  const performance =
    100 *
    (1 -
      Number(validatorStatsDailyResults[0].attestationsMissed) /
        (slotsInDay * user.validators.length));

  return {
    daily: {
      performance: formatNumber(performance, 4),
      consensus: totalDailyConsensusEth.toFixed(3),
      execution: totalDailyExecution.toFixed(3),
      usd: formatNumber(totalUsd, 3, "$"),
    },
    weekly: {
      performance: "0",
      consensus: "0",
      execution: "0",
      usd: formatNumber(0, 4, "$"),
    },
    monthly: {
      performance: "0",
      consensus: "0",
      execution: "0",
      usd: formatNumber(0, 4, "$"),
    },
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
  status: { syncing: boolean; headSlot: number; lastSlotProcessed: number }
): string {
  const { performance, balance, withdrawable, validatorStats } = stats;

  const syncStatus = status.syncing
    ? `⚠️ Syncing: ${status.lastSlotProcessed}/${status.headSlot} ⚠️`
    : null;

  // Define message sections
  const validatorStatus = status.syncing
    ? `⚪️ ${validatorStats.activeIds.length + validatorStats.inactiveIds.length} | 🚫 ${validatorStats.slashedIds.length} | 🔚 ${validatorStats.exitedIds.length}`
    : `🟢 ${validatorStats.activeIds.length} | 🟡 ${validatorStats.inactiveIds.length} | 🚫 ${validatorStats.slashedIds.length} | 🔚 ${validatorStats.exitedIds.length}`;

  const mainStats = [
    `1h performance: ${status.syncing ? "(needs sync)" : `${performance}%`}`,
    `Balance: ${balance.total} ${TOKEN_SYMBOL} ($${balance.value})`,
    `APY: 🔜`,
    `Claimable: ${withdrawable.total} ${TOKEN_SYMBOL} ($${withdrawable.value})`,
  ].join("\n");

  const rewardsSection = [
    `Rewards:`,
    `------------------------------`,
    `  |   %     ${TOKEN_SYMBOL}    ${FEE_REWARDS_SYMBOL}  Total`,
    `d | ${stats.rewards.daily.performance}  ${stats.rewards.daily.consensus}  ${stats.rewards.daily.execution}  ${stats.rewards.daily.usd}`,
    `w |            🔜`,
    `m |            🔜`,
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

async function getMissedAttestations(activeValidators: Validator[]) {
  const oneHourBefore = subHours(new Date(), 1);
  const fromSlot = getSlotNumberFromTimestamp(oneHourBefore.getTime());

  return await prisma.committee.findMany({
    where: {
      validatorIndex: {
        in: activeValidators.map((v) => v.id),
      },
      slot: {
        gte: fromSlot,
      },
      OR: [
        { attestationDelay: null },
        {
          attestationDelay: {
            gt: Number(process.env.BEACON_MAX_ATTESTATION_DELAY),
          },
        },
      ],
    },
    orderBy: {
      slot: "desc",
    },
  });
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
