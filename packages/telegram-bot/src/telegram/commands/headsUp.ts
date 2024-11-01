import { InlineKeyboard } from "grammy";
import { Conversation } from "@grammyjs/conversations";

import { sendMessage } from "@/src/telegram/utils/messaging.js";
import { inMemoryUsers } from "@/src/utils/inMemoryDB.js";
import { MyContext } from "@/src/config/session.js";
import { getDataFromContext } from "@/src/telegram/utils/getUserIdFromCtx.js";
import { TG_ADMIN_USER_IDS } from "@/src/constants/index.js";
import { AppError } from "@/src/utils/errors/AppError.js";
import { handleError } from "@/src/utils/errors/handleError.js";

type HeadsUpConversation = Conversation<MyContext>;

export async function headsUp(
  conversation: HeadsUpConversation,
  ctx: MyContext
) {
  try {
    const { userId, username } = getDataFromContext(ctx);

    // Check if the user is authorized
    if (!TG_ADMIN_USER_IDS.includes(userId)) {
      throw new AppError(
        "You are not authorized to use this command.",
        "UNAUTHORIZED"
      );
    }

    await ctx.reply("Enter the announcement message.");

    // Wait for the user to enter the message
    const { message } = await conversation.wait();
    const announcementMessage = message?.text;
    if (!announcementMessage) {
      await ctx.reply("Message can not be empty.");
      return;
    }

    // Send the message to all users
    const inlineKeyboard = new InlineKeyboard().text(
      "Dismiss",
      "remove_message"
    );
    Object.keys(inMemoryUsers).forEach(async (userId) => {
      const user = inMemoryUsers[Number(userId)];
      await sendMessage(username, announcementMessage, {
        reply_markup: inlineKeyboard,
      });
    });

    await ctx.reply("Message sent to all users.");
  } catch (error) {
    handleError(error, ctx.chat?.id);
  }
}
