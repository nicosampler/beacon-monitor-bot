import chunk from "lodash/chunk.js";

import {
  getFullUsers_db,
  getUserFull_db,
  updateUserMessageId_db,
} from "@/src/prisma/users.js";
import { notifyMissedAttestations } from "@/src/telegram/notifications/notifyMissedAttestations.js";
import { notifyUnderPerformance } from "@/src/telegram/notifications/notifyUnderPerformance.js";
import { notifyUserStatsMessage } from "@/src/telegram/notifications/notifyUserStatsMessage.js";
import { notifyValidatorsActivityChanged } from "@/src/telegram/notifications/notifyValidatorsActivityChanged.js";
import { handleError } from "@/src/utils/errors/handleError.js";
import { AsyncTask } from "toad-scheduler";

export async function updateUsersStatsImp(userId?: number) {
  const users = userId
    ? [await getUserFull_db(userId)]
    : await getFullUsers_db();

  const userChunks = chunk(users, 5);

  for (const currentChunk of userChunks) {
    await Promise.all(
      currentChunk.map(async (user) => {
        console.log(`${new Date()} - Notifying stats for: ${user.username}`);
        try {
          const messageIdStats = await notifyUserStatsMessage(user);

          if (messageIdStats && messageIdStats !== Number(user.messageId)) {
            await updateUserMessageId_db(Number(user.id), messageIdStats);
          }
        } catch (error: any) {
          console.error(
            `Error processing user ${user.username}:`,
            error.description || error?.message
          );
        }
      })
    );
  }
}

export const updateUsersStats = new AsyncTask("notifyUser", () =>
  updateUsersStatsImp().catch((error) => handleError(error))
);
