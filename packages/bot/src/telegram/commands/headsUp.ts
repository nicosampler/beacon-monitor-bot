import { Conversation } from '@grammyjs/conversations';
import { InlineKeyboard } from 'grammy';

import { getPrisma } from '@/src/config/prisma.js';
import { MyContext } from '@/src/config/session.js';
import { env } from '@/src/env.js';
import { getDataFromContext } from '@/src/telegram/utils/getUserIdFromCtx.js';
import { sendMessage } from '@/src/telegram/utils/messaging.js';
import { AppError } from '@/src/utils/errors/AppError.js';
import { handleError } from '@/src/utils/errors/handleError.js';

const prisma = getPrisma();

type HeadsUpConversation = Conversation<MyContext>;

export async function headsUp(conversation: HeadsUpConversation, ctx: MyContext) {
  try {
    const { userId } = getDataFromContext(ctx);

    // Check if the user is authorized
    if (!env.TG_ADMIN_USER_IDS.includes(userId)) {
      throw new AppError('You are not authorized to use this command.', 'UNAUTHORIZED');
    }

    await ctx.reply('Enter the announcement message.');

    // Wait for the user to enter the message
    const { message } = await conversation.wait();
    const announcementMessage = message?.text;
    if (!announcementMessage) {
      await ctx.reply('Message can not be empty.');
      return;
    }

    // Send the message to all users
    const inlineKeyboard = new InlineKeyboard().text('Dismiss', 'remove_message');

    const users = await prisma.user.findMany({
      where: {
        hasBlockedBot: false,
      },
    });
    users.forEach(async (user) => {
      try {
        await sendMessage(user.userId.toString(), announcementMessage, {
          reply_markup: inlineKeyboard,
        });
      } catch (error) {
        console.error(`Error sending heads_up message to user ${user.userId}:`, error);
      }
    });

    await ctx.reply('Message sent to all users.');
  } catch (error) {
    handleError(error, ctx.chat?.id);
  }
}
