import { CommandContext, Context } from 'grammy';

import { bot } from '@/src/config/index.js';
import { setUserBlockedBot_db } from '@/src/prisma/users.js';
import { AppError } from '@/src/utils/errors/AppError.js';

type TG_SendMessageParams = Parameters<typeof bot.api.sendMessage>;
type TG_EditMessageParams = Parameters<typeof bot.api.editMessageText>;
type TG_ReplayParams = Parameters<CommandContext<Context>['reply']>;

// Send a new message
export async function sendMessage(...args: TG_SendMessageParams) {
  const [chatId] = args;
  try {
    return await bot.api.sendMessage(...args);
  } catch (error) {
    if (error instanceof Error && 'error_code' in error && error.error_code == 403) {
      try {
        await setUserBlockedBot_db(Number(chatId));
      } catch (error) {
        console.error('Error setting user blocked bot:', error);
      }
    }
    throw error;
  }
}

// Edit a message
export async function editMessageText(...args: TG_EditMessageParams) {
  const [chatId, messageId, text, ...rest] = args;

  try {
    return await bot.api.editMessageText(chatId, messageId, text, ...rest);
  } catch (error) {
    if (error instanceof Error && 'error_code' in error && error.error_code == 403) {
      try {
        await setUserBlockedBot_db(Number(chatId));
      } catch (error) {
        console.error('Error setting user blocked bot:', error);
      }
    }
    throw error;
  }
}

// reply to a message
export async function replyMessage(ctx: Context, ...args: TG_ReplayParams) {
  try {
    return ctx.reply(...args);
  } catch (error) {
    throw new AppError('Error replying to message', 'TELEGRAM_INTERACTION_ERROR', error);
  }
}

// Remove a message
export async function removeMessage(chatId: number, messageId: number) {
  try {
    const res = await bot.api.deleteMessage(chatId, messageId);
    return res;
  } catch (error) {
    console.error('Error removing message:', error);
    throw error;
  }
}
