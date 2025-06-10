import { addDays, compareAsc, format } from 'date-fns';
import { Context } from 'grammy';
import { Message } from 'grammy/types';

import { signer } from '@/src/config/provider.js';
import { CLAIM_COOL_DOWN_DAYS } from '@/src/constants/index.js';
import { env } from '@/src/env.js';
import { getUserOrFail_db, updateUserById_db } from '@/src/prisma/users.js';
import { getWithdrawalAddresses_db } from '@/src/prisma/withdrawalAddresses.js';
import { getDataFromContext } from '@/src/telegram/utils/getUserIdFromCtx.js';
import { editMessageText, replyMessage } from '@/src/telegram/utils/messaging.js';
import { AppError } from '@/src/utils/errors/AppError.js';
import { handleError } from '@/src/utils/errors/handleError.js';
import depositInstance from '@/src/utils/evm/deposit.js';

async function _calculateClaimCoolDown(userId: number) {
  try {
    const userDB = await getUserOrFail_db(userId);
    return addDays(userDB.lastClaimed || new Date('01/01/2020'), CLAIM_COOL_DOWN_DAYS);
  } catch (error) {
    throw new AppError('Error calculating claim cool down', 'BD_ERROR', error);
  }
}

async function _claimRewards(withdrawalAddresses: string[]) {
  try {
    const tx = await depositInstance.connect(signer)['claimWithdrawals'](withdrawalAddresses);
    return (await tx.wait()).transactionHash;
  } catch (error) {
    throw new AppError('Error claiming rewards', 'EVM_ERROR', error);
  }
}

export async function claim(ctx: Context) {
  let tmpReply: Message.TextMessage | undefined = undefined;
  try {
    tmpReply = await replyMessage(ctx, `Claiming... Please be patient, it may take a few minutes!`);

    // get user id
    const { userId } = await getDataFromContext(ctx);

    // check if user can claim
    const claimCoolDown = await _calculateClaimCoolDown(userId);
    if (compareAsc(claimCoolDown, new Date()) > 0) {
      await editMessageText(
        tmpReply.chat.id,
        tmpReply.message_id,
        `😢 You can claim again at ${format(claimCoolDown, 'MM/dd/yyyy hh:mm aaa')} UTC.`,
      );
      return;
    }

    // send claim tx
    const withdrawalAddresses = await getWithdrawalAddresses_db(userId);
    const transactionHash = await _claimRewards(withdrawalAddresses.map((wa) => wa.address));
    await editMessageText(
      tmpReply.chat.id,
      tmpReply.message_id,
      `🤑 Claim sent. ${env.EXECUTION_EXPLORER_URL}/tx/${transactionHash}`,
    );

    // update user.
    await updateUserById_db(userId, { lastClaimed: new Date() });
  } catch (error) {
    await handleError(error, ctx.message?.chat.id);
  }
}
