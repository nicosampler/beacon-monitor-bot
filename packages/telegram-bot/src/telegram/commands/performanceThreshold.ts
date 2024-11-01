import { getDataFromContext } from "@/src/telegram/utils/getUserIdFromCtx.js";

import { Conversation } from "@grammyjs/conversations";
import { MyContext } from "@/src/config/session.js";
import { handleError } from "@/src/utils/errors/handleError.js";
import { sendMessage } from "@/src/telegram/utils/messaging.js";
import { updateUserById_db } from "@/src/prisma/users.js";
import { isNumberInRange } from "@/src/utils/misc.js";

async function _waitForInput(
  conversation: Conversation<MyContext>,
  ctx: MyContext
) {
  let isValidInput = false;
  let input = "";

  while (!isValidInput) {
    const { message } = await conversation.wait();
    input = message?.text?.trim() ?? "";

    if (input.toLowerCase() === "exit") {
      return;
    }

    // check if it is a valid eth address
    if (!isNumberInRange(input, 1, 100)) {
      await ctx.reply(`Enter a number between 1 and 100.`);
      continue;
    } else {
      isValidInput = true;
      input = input.toLowerCase();
    }
  }

  return Number(input);
}

export async function performanceThreshold(
  conversation: Conversation<MyContext>,
  ctx: MyContext
) {
  try {
    // ask for the withdrawal address
    await ctx.reply(
      `Enter the performance drop percentage that should trigger an alert. (type "exit" to abort)`
    );

    // get uerId
    const { userId } = await getDataFromContext(ctx);

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
