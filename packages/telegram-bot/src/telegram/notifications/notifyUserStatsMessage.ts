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
import { formatNumber } from "@/src/utils/misc.js";
import { AppError } from "@/src/utils/errors/AppError.js";

export async function notifyUserStatsMessage(
  userId: number
): Promise<number | undefined> {
  const user = inMemoryUsers[userId];
  const performance = user.performance;
  const feeRewards = user.priorityFeeRewards;
  const status = user.status;

  const totalBalance = performance?.balance || 0;
  const totalBalancePrice = (totalBalance * tokenPrice).toFixed(2);

  const blockRewards1d = performance?.performance1d || 0;
  const blockRewards7d = performance?.performance7d || 0;
  const blockRewards31d = performance?.performance31d || 0;
  const blockRewards1dUSD = blockRewards1d * tokenPrice;
  const blockRewards7dUSD = blockRewards7d * tokenPrice;
  const blockRewards31dUSD = blockRewards31d * tokenPrice;

  const feeRewards1d = Number(formatEther(feeRewards?.d || 0));
  const feeRewards7d = Number(formatEther(feeRewards?.w || 0));
  const feeRewards31d = Number(formatEther(feeRewards?.m || 0));
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

  const rewards1dRow = user.performance
    ? `${formatNumber(blockRewards1d)}  ${formatNumber(
        feeRewards1d
      )}  ${rewards1dUSD}`
    : "        loading...";

  const rewards7dRow = user.performance
    ? `${formatNumber(blockRewards7d)}  ${formatNumber(
        feeRewards7d
      )}  ${rewards7dUSD}`
    : "        loading...";

  const rewards31dRow = user.performance
    ? `${formatNumber(blockRewards31d)}  ${formatNumber(
        feeRewards31d
      )}  ${rewards31dUSD}`
    : "        loading...";

  const withdrawable = user.withdrawable || 0;
  const withdrawablePrice = withdrawable * tokenPrice;
  const withdrawableFormatted = withdrawable.toFixed(4);
  const withdrawablePriceFormatted = withdrawablePrice.toFixed(2);

  const validatorsStatusMsg = status
    ? `🟢 ${status.active} | 🟡 ${status.inactiveIds.length} | 🚫 ${status.slashedIds.length} | 🔚 ${status.exitedIds.length}`
    : `🟢 ⌛️ | 🟡 ⌛️ | 🚫 ⌛️ | 🔚 ⌛️`;

  const claimableMsg = user.withdrawable
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
    ? `${totalBalance.toFixed(3)} ${TOKEN_SYMBOL} ($${totalBalancePrice})`
    : "loading...";

  const attestationsMsg = user.last100AttestedPercentage
    ? `${user.last100AttestedPercentage}%`
    : "loading...";

  const tokenPriceFormatted = tokenPrice
    ? `${TOKEN_SYMBOL}: $${tokenPrice.toFixed(2)}`
    : `${TOKEN_SYMBOL}: loading...`;

  const finalMessage = `\`${validatorsStatusMsg}      

Attestations: ${attestationsMsg}
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

  let _messageId = user.messageId;
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
