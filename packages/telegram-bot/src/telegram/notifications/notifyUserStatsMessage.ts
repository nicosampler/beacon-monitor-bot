import format from "date-fns/format";
import { bot } from "@/src//config/index.js";
import { tokenPrice } from "@/src/scheduler/tasks/tokenPriceTask.js";
import { inMemoryUsers } from "@/src/utils/inMemoryDB.js";
import { sendMessage } from "@/src/telegram/utils/messaging.js";
import {
  TOKEN_SYMBOL,
  FEE_REWARDS_IN_STABLE,
  FEE_REWARDS_SYMBOL,
  TG_ERROR_SAME_MESSAGE,
  DAYS_IN_YEAR,
  DAYS_IN_MONTH,
} from "@/src/constants/index.js";
import { formatEther } from "ethers/lib/utils.js";
import { formatNumber, VALIDATOR_STATUS } from "@/src/utils/misc.js";
import { AppError } from "@/src/utils/errors/AppError.js";
import { getWithdrawableAmountByUserId } from "@/src/utils/getWithdrawableAmountByUserId.js";
import { getUserFull_db } from "@/src/prisma/users.js";
import { getPrisma } from "@/src/config/prisma.js";
import { subHours } from "date-fns";
import { getSlotNumberFromTimestamp } from "@/src/utils/time.js";

const prisma = getPrisma();

const tokenUnit = 32000000000;

const BEACON_SLOT_DURATION_IN_SECONDS = Number(
  process.env.BEACON_SLOT_DURATION_IN_SECONDS
);
const slotsIn1h = 3600 / BEACON_SLOT_DURATION_IN_SECONDS;

export async function notifyUserStatsMessage(
  userId: number
): Promise<number | undefined> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      //withdrawalAddresses: true,
      validators: true,
    },
  });

  const beaconActiveValidators = user.validators.filter(
    (validator) =>
      validator.status === VALIDATOR_STATUS.ACTIVE_ONGOING ||
      validator.status === VALIDATOR_STATUS.ACTIVE_EXITING
  );
  const oneHourBefore = subHours(new Date(), 1);

  const missedAttestedSlots = await prisma.committee.findMany({
    where: {
      validatorIndex: {
        in: beaconActiveValidators.map((v) => v.id),
      },
      slot: { gte: getSlotNumberFromTimestamp(oneHourBefore.getTime()) },
    },
  });

  const status = {
    active: [],
    inactiveIds: [],
    slashedIds: user.validators.filter(
      (validator) =>
        validator.status === VALIDATOR_STATUS.ACTIVE_SLASHED ||
        validator.status === VALIDATOR_STATUS.EXITED_SLASHED
    ),
    exitedIds: user.validators.filter(
      (validator) =>
        validator.status === VALIDATOR_STATUS.EXITED_UNSLASHED ||
        validator.status === VALIDATOR_STATUS.WITHDRAWAL_DONE
    ),
  };
  // calc performance percentage between slotsIn1h and missedAttestedSlots
  const performance =
    ((slotsIn1h - missedAttestedSlots.length) / slotsIn1h) * 100;
  const feeRewards = 0; //user.priorityFeeRewards;

  const totalBalanceInGwei = user.validators.reduce(
    (acc, validator) => acc + BigInt(validator.balance.toString()),
    BigInt(0)
  );
  const totalBalance = Number(totalBalanceInGwei) / tokenUnit;
  const totalBalancePrice = (totalBalance * tokenPrice).toFixed(2);

  const blockRewards1d = 0; //performance?.performance1d || 0;
  const blockRewards7d = 0; //performance?.performance7d || 0;
  const blockRewards31d = 0; //performance?.performance31d || 0;
  const blockRewards1dUSD = blockRewards1d * tokenPrice;
  const blockRewards7dUSD = blockRewards7d * tokenPrice;
  const blockRewards31dUSD = blockRewards31d * tokenPrice;

  const feeRewards1d = 0; //Number(formatEther(feeRewards?.d || 0));
  const feeRewards7d = 0; //Number(formatEther(feeRewards?.w || 0));
  const feeRewards31d = 0; //Number(formatEther(feeRewards?.m || 0));
  const feeRewards1dUSD =
    feeRewards1d * (FEE_REWARDS_IN_STABLE ? 1 : tokenPrice);
  const feeRewards7dUSD =
    feeRewards7d * (FEE_REWARDS_IN_STABLE ? 1 : tokenPrice);
  const feeRewards31dUSD =
    feeRewards31d * (FEE_REWARDS_IN_STABLE ? 1 : tokenPrice);

  const rewards1dUSD = formatNumber(
    blockRewards1dUSD + feeRewards1dUSD,
    5,
    "$"
  );
  const rewards7dUSD = formatNumber(
    blockRewards7dUSD + feeRewards7dUSD,
    5,
    "$"
  );
  const rewards31dUSD = formatNumber(
    blockRewards31dUSD + feeRewards31dUSD,
    5,
    "$"
  );

  const rewards1dRow = 0 //user.performance
    ? `${formatNumber(blockRewards1d)}  ${formatNumber(
        feeRewards1d
      )}  ${rewards1dUSD}`
    : "        loading...";

  const rewards7dRow = 0 //user.performance
    ? `${formatNumber(blockRewards7d)}  ${formatNumber(
        feeRewards7d
      )}  ${rewards7dUSD}`
    : "        loading...";

  const rewards31dRow = 0 //user.performance
    ? `${formatNumber(blockRewards31d)}  ${formatNumber(
        feeRewards31d
      )}  ${rewards31dUSD}`
    : "        loading...";

  const withdrawable = await getWithdrawableAmountByUserId(userId);
  const withdrawablePrice = withdrawable * tokenPrice;
  const withdrawableFormatted = withdrawable.toFixed(4);
  const withdrawablePriceFormatted = withdrawablePrice.toFixed(2);

  const validatorsStatusMsg = status
    ? `🟢 ${status.active.length} | 🟡 ${status.inactiveIds.length} | 🚫 ${status.slashedIds.length} | 🔚 ${status.exitedIds.length}`
    : `🟢 ⌛️ | 🟡 ⌛️ | 🚫 ⌛️ | 🔚 ⌛️`;

  const claimableMsg = withdrawable
    ? `${withdrawableFormatted} ${TOKEN_SYMBOL} ($${withdrawablePriceFormatted})`
    : `loading...`;

  const apy =
    totalBalance && blockRewards31d
      ? ((1 + blockRewards31d / totalBalance) **
          (DAYS_IN_YEAR / DAYS_IN_MONTH) -
          1) *
        100
      : undefined;
  const apyMsg = apy !== undefined ? `${apy.toFixed(2)}%` : "loading...";

  const balanceMsg = totalBalance
    ? `${totalBalance.toFixed(2)} ${TOKEN_SYMBOL} ($${totalBalancePrice})`
    : "loading...";

  const oneHourPerformanceMsg = performance ? `${performance}%` : "loading...";

  const tokenPriceFormatted = tokenPrice
    ? `${TOKEN_SYMBOL}: $${tokenPrice.toFixed(2)}`
    : `${TOKEN_SYMBOL}: loading...`;

  const finalMessage = `\`${validatorsStatusMsg}      

1h performance: ${oneHourPerformanceMsg}
Balance: ${balanceMsg} 
APY: ${apyMsg}
Claimable: ${claimableMsg}

Rewards:
----------------------------
  |    ${TOKEN_SYMBOL}    ${FEE_REWARDS_SYMBOL}    Total
d | ${rewards1dRow}
w | ${rewards7dRow}
m | ${rewards31dRow}

${tokenPriceFormatted}

Updated: ${format(new Date(), "MM/dd hh:mmaaa")} UTC
  \``;

  let _messageId = Number(user.messageId);
  const chatId = user.chatId;

  // send stats message
  if (_messageId) {
    await bot.api
      .editMessageText(Number(chatId), Number(_messageId), finalMessage, {
        parse_mode: "MarkdownV2",
      })
      .catch((error: any) => {
        // if the message is the same, ignore
        // if the message is not the same, might have happened because of a message deletion
        // in this case, we need to send a new message
        if (error.description !== TG_ERROR_SAME_MESSAGE) {
          _messageId = undefined;
        }
      });
  } else {
    _messageId = await sendMessage(Number(chatId), finalMessage, {
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

  return _messageId;
}
