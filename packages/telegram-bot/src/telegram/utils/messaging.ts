import { bot } from "@/src/config/index.js";
import { AppError } from "@/src/utils/errors/AppError.js";
import { CommandContext, Context } from "grammy";
import { Message } from "grammy/types";
// import { type Context as BaseContext } from "grammy";

type TG_SendMessageParams = Parameters<typeof bot.api.sendMessage>;
type TG_ReplayParams = Parameters<CommandContext<Context>["reply"]>;

// Send a new message
export async function sendMessage(...args: TG_SendMessageParams) {
  try {
    return bot.api.sendMessage(...args);
  } catch (error) {
    throw new AppError(
      "Error sending to message",
      "TELEGRAM_INTERACTION_ERROR",
      error
    );
  }
}

// reply to a message
export async function replyMessage(ctx: Context, ...args: TG_ReplayParams) {
  try {
    return ctx.reply(...args);
  } catch (error) {
    throw new AppError(
      "Error replying to message",
      "TELEGRAM_INTERACTION_ERROR",
      error
    );
  }
}

// Edit a message
export async function editMessage(message: Message.TextMessage, text: string) {
  try {
    return bot.api.editMessageText(message.chat.id, message.message_id, text);
  } catch (error) {
    throw new AppError(
      "Error editing message",
      "TELEGRAM_INTERACTION_ERROR",
      error
    );
  }
}

// Remove a message
export async function removeMessage(chatId: number, messageId: number) {
  try {
    return bot.api.deleteMessage(chatId, messageId);
  } catch (error) {
    throw new AppError(
      "Error removing message",
      "TELEGRAM_INTERACTION_ERROR",
      error
    );
  }
}
