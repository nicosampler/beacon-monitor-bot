import chunk from "lodash/chunk.js";

import {
  getAllUserIds_db,
  getFullUsers_db,
  updateUserMessageId_db,
} from "@/src/prisma/users.js";
import { notifyMissedAttestations } from "@/src/telegram/notifications/notifyMissedAttestations.js";
import { notifyUnderPerformance } from "@/src/telegram/notifications/notifyUnderPerformance.js";
import { notifyUserStatsMessage } from "@/src/telegram/notifications/notifyUserStatsMessage.js";
import { notifyValidatorsActivityChanged } from "@/src/telegram/notifications/notifyValidatorsActivityChanged.js";
import { handleError } from "@/src/utils/errors/handleError.js";
import { AsyncTask } from "toad-scheduler";
import { getEpochSlots } from "@/src/utils/misc.js";

export async function updateUsersStatsImp(userId?: number) {
  const users = await getAllUserIds_db(userId);

  const userChunks = chunk(users, 5);

  for (const currentChunk of userChunks) {
    await Promise.all(
      currentChunk.map(async (user) => {
        console.log(`${new Date()} - Notifying stats for: ${user.username}`);
        try {
          const messageIdStats = await notifyUserStatsMessage(user.userId);

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
