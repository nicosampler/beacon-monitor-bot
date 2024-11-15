import chunk from "lodash/chunk.js";

import {
  getUserFull_db,
  getUsers_db,
  updateUserMessageId_db,
} from "@/src/prisma/users.js";
import { notifyMissedAttestations } from "@/src/telegram/notifications/notifyMissedAttestations.js";
import { notifyUnderPerformance } from "@/src/telegram/notifications/notifyUnderPerformance.js";
import { notifyUserStatsMessage } from "@/src/telegram/notifications/notifyUserStatsMessage.js";
import { notifyValidatorsActivityChanged } from "@/src/telegram/notifications/notifyValidatorsActivityChanged.js";
import { handleError } from "@/src/utils/errors/handleError.js";
import { AsyncTask } from "toad-scheduler";

export async function updateUsersStatsImp(userId?: number) {
  const users = (
    userId ? [await getUserFull_db(userId)] : await getUsers_db()
  ).filter((user) => user.username == "nfd_87");

  // Create chunks of 5 users

  // Create chunks of 5 users
  const userChunks = chunk(users, 5);

  // Process each chunk sequentially
  for (const userChunk of userChunks) {
    console.log(
      `${new Date()} Users: ${userChunk.map((u) => u.username).join(", ")}`
    );
    // Process users in current chunk
    const promises = userChunk.map(async (user) => {
      const userId = Number(user.id);
      try {
        const messageIdStats = await notifyUserStatsMessage(userId);
        if (messageIdStats && messageIdStats !== Number(user.messageId)) {
          await updateUserMessageId_db(userId, messageIdStats);
        }
      } catch (error) {}
    });

    await Promise.all(promises);
    console.log(`${new Date()} Done`);
  }
}

export const updateUsersStats = new AsyncTask("notifyUser", () =>
  updateUsersStatsImp().catch((error) => handleError(error))
);
