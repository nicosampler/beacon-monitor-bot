import { AppError } from "@/src/utils/errors/AppError.js";
import { Context } from "grammy";

export function getDataFromContext(ctx: Context) {
  const userId = ctx.from?.id;
  const username = ctx.from?.username;

  if (!userId) {
    throw new AppError(`User id not found`, "TELEGRAM_DATA_ERROR");
  }

  if (!username) {
    throw new AppError(`Username not found`, "TELEGRAM_DATA_ERROR");
  }

  return { userId, username, chatId: userId };
}
