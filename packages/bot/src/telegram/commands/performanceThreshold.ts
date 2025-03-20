import { Conversation } from '@grammyjs/conversations';

import { MyContext } from '@/src/config/session.js';
import { getUser_db, updateUserById_db } from '@/src/prisma/users.js';
import { getDataFromContext } from '@/src/telegram/utils/getUserIdFromCtx.js';
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
    if (!isNumberInRange(input, 50, 99.9)) {
      await ctx.reply(`Enter a number between 50 and 99.9.`);
      continue;
    } else {
      isValidInput = true;
      input = input.toLowerCase();
    }
  }

  return Number(input);
}

export async function performanceThreshold(conversation: Conversation<MyContext>, ctx: MyContext) {
  try {
    // get uerId
    const { userId } = await getDataFromContext(ctx);
    const user = await getUser_db(userId);
    if (!user) {
      throw new AppError('User not found', 'NOT_FOUND');
    }

    // ask for the withdrawal address
    await ctx.reply(
      `Enter the minimum performance percentage below which an alert should be triggered (e.g., enter "80" to be alerted when performance drops below 80%). Current threshold is ${user.performanceThreshold}. (Type "exit" to abort).`,
    );

    const input = await _waitForInput(conversation, ctx);

    // check if the user has aborted the process
    if (input == undefined) {
      return;
    }

    // Update DB
    await updateUserById_db(userId, {
      performanceThreshold: input,
    });

    // Send confirmation message
    await sendMessage(userId, `Performance threshold set at: ${input}%.`);
  } catch (error) {
    await handleError(error, ctx.message?.chat.id);
  }
}
