import { Conversation } from '@grammyjs/conversations';

import { getDataFromContext } from '../utils/getUserIdFromCtx.js';

import { MyContext } from '@/src/config/session.js';
import { getUser_db, updateUserById_db } from '@/src/prisma/users.js';
import { sendMessage } from '@/src/telegram/utils/messaging.js';
import { AppError } from '@/src/utils/errors/AppError.js';
import { handleError } from '@/src/utils/errors/handleError.js';
import { isNumberInRange } from '@/src/utils/misc.js';

async function _waitForInput(conversation: Conversation<MyContext>, ctx: MyContext) {
  let isValidInput = false;
  let input = '';

  while (!isValidInput) {
    const { message } = await conversation.wait();
    input = message?.text?.trim() ?? '';

    if (input.toLowerCase() === 'exit') {
      return;
    }

    // check if it is a valid eth address
    if (!isNumberInRange(input, 1, 10)) {
      await ctx.reply(`Enter a number between 1 and 10.`);
      continue;
    } else {
      isValidInput = true;
      input = input.toLowerCase();
    }
  }

  return Number(input);
}

export async function inactiveOnMissedAttestations(
  conversation: Conversation<MyContext>,
  ctx: MyContext,
) {
  try {
    // get uerId
    const { userId } = await getDataFromContext(ctx);
    const user = await getUser_db(userId);
    if (!user) {
      throw new AppError('User not found', 'NOT_FOUND');
    }

    // ask for the withdrawal address
    await ctx.reply(
      `Enter the number of consecutive missed attestations after which a validator is considered inactive. Current threshold is ${user.inactiveOnMissedAttestations}. (type "exit" to abort)`,
    );

    const input = await _waitForInput(conversation, ctx);

    // check if the user has aborted the process
    if (input == undefined) {
      return;
    }

    // Update DB
    await updateUserById_db(userId, {
      inactiveOnMissedAttestations: input,
    });

    // Send confirmation message
    await sendMessage(userId, `Threshold set at: ${input}.`);
  } catch (error) {
    await handleError(error, ctx.message?.chat.id);
  }
}
