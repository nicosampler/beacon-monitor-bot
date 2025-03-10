import { DEFAULT_ERROR_MESSAGE } from "@/src/constants/index.js";
import { AppError } from "@/src/utils/errors/AppError.js";
import { sendMessage } from "@/src/telegram/utils/messaging.js";

export async function handleError(
  error: unknown,
  chatIdOrUsername?: number | string
): Promise<void> {
  if (!chatIdOrUsername) {
    console.error(error);
    return;
  }

  if (error instanceof AppError) {
    await sendMessage(chatIdOrUsername, error.toString());
  } else {
    await sendMessage(chatIdOrUsername, DEFAULT_ERROR_MESSAGE);
  }
}
