import { Context } from 'grammy';

import { sendMessage } from '../utils/messaging.js';

import { getPrisma } from '@/src/config/prisma.js';
import { getUser_db, setUserUnblockedBot_db } from '@/src/prisma/users.js';
import { getDataFromContext } from '@/src/telegram/utils/getUserIdFromCtx.js';

const prisma = getPrisma();

/**
 * Middleware to handle user authentication and block status
 * Creates new users if they don't exist and unblocks users when they interact
 */
export async function userMiddleware(ctx: Context, next: () => Promise<void>) {
  if (ctx.from?.id) {
    try {
      if (!ctx.from.username) {
        await sendMessage(ctx.from.id, 'Please set a Telegram username to continue.');
        return;
      }

      const { userId, username } = await getDataFromContext(ctx);
      const user = await getUser_db(userId);
      if (!user) {
        await prisma.user.create({
          data: {
            id: userId,
            userId,
            username: username,
            chatId: userId,
          },
        });
      } else if (user.hasBlockedBot) {
        await setUserUnblockedBot_db(userId);
      }
    } catch (error) {
      console.error(`Error processing user message ${ctx.from.id}:${ctx.from.username}: ${error}.`);
      await sendMessage(ctx.from.id, 'Something went wrong. Please try again later.');
      return;
    }
  }
  return next();
}
