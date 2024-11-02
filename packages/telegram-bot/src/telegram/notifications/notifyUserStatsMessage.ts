import format from "date-fns/format";
import { subHours } from "date-fns";
import { formatEther } from "ethers/lib/utils.js";
import { bot } from "@/src/config/index.js";
import { getPrisma } from "@/src/config/prisma.js";
import { tokenPrice } from "@/src/scheduler/tasks/tokenPriceTask.js";
import { sendMessage } from "@/src/telegram/utils/messaging.js";
import { formatNumber, VALIDATOR_STATUS } from "@/src/utils/misc.js";
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
import { Committee, User, Validator } from "@prisma/client";

const prisma = getPrisma();
const tokenUnit = 32000000000;
const BEACON_SLOT_DURATION_IN_SECONDS = Number(
  process.env.BEACON_SLOT_DURATION_IN_SECONDS
);
const slotsIn1h = 3600 / BEACON_SLOT_DURATION_IN_SECONDS;

interface ValidatorStats {
  activeIds: number[];
  inactiveIds: number[];
  slashedIds: number[];
  exitedIds: number[];
}

interface UserStats {
  performance: number;
  balance: {
    total: number;
    value: string;
  };
  withdrawable: {
    total: number;
    value: string;
  };
  apy?: number;
  rewards: {
    daily: { block: number; fee: number; usd: string };
    weekly: { block: number; fee: number; usd: string };
    monthly: { block: number; fee: number; usd: string };
  };
  validatorStats: ValidatorStats;
}

export async function notifyUserStatsMessage(
  userId: number
): Promise<number | undefined> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { validators: true },
  });

  const headSlot = getSlotNumberFromTimestamp(new Date().getTime()) - 1;
  const lastSlotProcessed = await prisma.slot.findFirst({
    where: { slot: headSlot, attestationsFetched: true },
    orderBy: { slot: "desc" },
  });
  let syncing = false;
  if (
    headSlot - lastSlotProcessed?.slot >
    Number(process.env.BEACON_MAX_ATTESTATION_DELAY)
  ) {
    syncing = true;
  }

  if (!lastSlotProcessed) return;
  const stats = await calculateUserStats(user);
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
  amountOfMissedAttestationsToBeInactive: number
): ValidatorStats {
  // Filter validators that are "active" for the beacon chain
  const beaconActiveValidators = validators.filter(
    (v) =>
      v.status === VALIDATOR_STATUS.ACTIVE_ONGOING ||
      v.status === VALIDATOR_STATUS.ACTIVE_EXITING
  );

  // A validator is inactive if it appears in all of the last amountOfMissedAttestationsToBeInactive entries
  const lastEntries = missedAttestations.slice(
    0,
    amountOfMissedAttestationsToBeInactive
  );
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

async function calculateUserStats(
  user: User & { validators: Validator[] }
): Promise<UserStats> {
  const performance = await calculatePerformanceStats(user);
  const balanceStats = calculateBalanceStats(user.validators);
  const rewardsStats = calculateRewardsStats();
  const withdrawable = await getWithdrawableAmountByUserId(user.id);
  const activeValidators = user.validators.filter(
    (v) =>
      v.status === VALIDATOR_STATUS.ACTIVE_ONGOING ||
      v.status === VALIDATOR_STATUS.ACTIVE_EXITING
  );
  const missedAttestations = await getMissedAttestations(activeValidators);
  const validatorStats = calculateValidatorStats(
    user.validators,
    missedAttestations,
    user.attestationThreshold
  );

  return {
    performance,
    validatorStats,
    balance: {
      total: balanceStats.total,
      value: balanceStats.value,
    },
    withdrawable: {
      total: withdrawable,
      value: (withdrawable * tokenPrice).toFixed(2),
    },
    apy: 0,
    rewards: rewardsStats,
  };
}

async function calculatePerformanceStats(
  user: User & { validators: Validator[] }
) {
  const activeValidators = user.validators.filter(
    (v) =>
      v.status === VALIDATOR_STATUS.ACTIVE_ONGOING ||
      v.status === VALIDATOR_STATUS.ACTIVE_EXITING
  );

  const missedAttestations = await getMissedAttestations(activeValidators);

  const expectedAttestations = slotsIn1h * activeValidators.length;
  if (expectedAttestations === 0) return 0;
  return (
    ((expectedAttestations - missedAttestations.length) /
      expectedAttestations) *
    100
  );
}

function calculateBalanceStats(validators: Validator[]) {
  const totalBalanceInGwei = validators.reduce(
    (acc, validator) => acc + BigInt(validator.balance.toString()),
    BigInt(0)
  );

  const total = Number(totalBalanceInGwei) / tokenUnit;

  return {
    total,
    value: (total * tokenPrice).toFixed(2),
  };
}

function calculateRewardsStats() {
  // Por ahora retornamos datos mock, aquí iría la lógica real de rewards
  return {
    daily: { block: 0, fee: 0, usd: formatNumber(0, 2, "$") },
    weekly: { block: 0, fee: 0, usd: formatNumber(0, 2, "$") },
    monthly: { block: 0, fee: 0, usd: formatNumber(0, 2, "$") },
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

  return `\`🟢 ${validatorStats.activeIds.length} | 🟡 ${validatorStats.inactiveIds.length} | 🚫 ${validatorStats.slashedIds.length} | 🔚 ${validatorStats.exitedIds.length}

1h performance: ${status.syncing ? "..." : `${performance}%`}
Balance: ${balance.total.toFixed(2)} ${TOKEN_SYMBOL} ($${balance.value})
APY: WIP
Claimable: ${withdrawable.total.toFixed(4)} ${TOKEN_SYMBOL} ($${withdrawable.value})

Rewards:
----------------------------
  |    ${TOKEN_SYMBOL}    ${FEE_REWARDS_SYMBOL}    Total
d |    WIP     WIP     WIP
w |    WIP     WIP     WIP
m |    WIP     WIP     WIP

${TOKEN_SYMBOL}: $${tokenPrice.toFixed(2)}

Bot status: ${status.syncing ? "🟡" : "🟢"} ${status.lastSlotProcessed}/${status.headSlot}
Updated: ${format(new Date(), "MM/dd hh:mmaaa")} UTC
  \``;
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

  return await sendMessage(chatId, message, {
    disable_notification: true,
    parse_mode: "MarkdownV2",
  })
    .then((res) => res.message_id)
    .catch((error) => {
      throw new AppError(
        "Error editing message",
        "TELEGRAM_INTERACTION_ERROR",
        error
      );
    });
}
