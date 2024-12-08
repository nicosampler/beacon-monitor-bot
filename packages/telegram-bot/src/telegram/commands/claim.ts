import { Context } from "grammy";
import { addDays, compareAsc, format } from "date-fns";
import { Message } from "grammy/types";

import { getWithdrawalAddresses_db } from "@/src/prisma/withdrawalAddresses.js";
import { signer } from "@/src/config/provider.js";
import depositInstance from "@/src/utils/evm/deposit.js";
import { getUser_db, updateUserById_db } from "@/src/prisma/users.js";
import { getDataFromContext } from "@/src/telegram/utils/getUserIdFromCtx.js";
import { editMessage, replyMessage } from "@/src/telegram/utils/messaging.js";
import { CLAIM_COOL_DOWN_DAYS, EXPLORER_URL } from "@/src/constants/index.js";
import { AppError } from "@/src/utils/errors/AppError.js";
import { handleError } from "@/src/utils/errors/handleError.js";

async function _calculateClaimCoolDown(userId: number) {
  try {
    const userDB = await getUser_db(userId);
    const now = new Date();
    return addDays(
      userDB.lastClaimed || new Date("01/01/2020"),
      CLAIM_COOL_DOWN_DAYS
    );
  } catch (error) {
    throw new AppError("Error calculating claim cool down", "BD_ERROR", error);
  }
}

async function _claimRewards(withdrawalAddresses: string[]) {
  try {
    const tx = await depositInstance
      .connect(signer)
      .claimWithdrawals(withdrawalAddresses);
    return (await tx.wait()).transactionHash;
  } catch (error) {
    throw new AppError("Error claiming rewards", "EVM_ERROR", error);
  }
}

export async function claim(ctx: Context) {
  let tmpReply: Message.TextMessage | undefined = undefined;
  try {
    tmpReply = await replyMessage(
      ctx,
      `Claiming... Please be patient, it may take a few minutes!`
    );

    // get user id
    const { userId } = await getDataFromContext(ctx);

    // check if user can claim
    const claimCoolDown = await _calculateClaimCoolDown(userId);
    if (compareAsc(claimCoolDown, new Date()) > 0) {
      await editMessage(
        tmpReply,
        `😢 You can claim again at ${format(
          claimCoolDown,
          "MM/dd/yyyy hh:mm aaa"
        )} UTC.`
      );
      return;
    }

    // send claim tx
    const withdrawalAddresses = await getWithdrawalAddresses_db(userId);
    const transactionHash = await _claimRewards(
      withdrawalAddresses.map((wa) => wa.address)
    );
    await editMessage(
      tmpReply,
      `🤑 Claim sent. ${EXPLORER_URL}/tx/${transactionHash}`
    );

    // update user.
    await updateUserById_db(userId, { lastClaimed: new Date() });
  } catch (error) {
    await handleError(error, ctx.message?.chat.id);
  }
}
