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
  const users = userId ? [await getUserFull_db(userId)] : await getUsers_db();

  users.forEach(async (user) => {
    const userId = Number(user.id);

    // stats notification
    const messageIdStats = await notifyUserStatsMessage(userId);
    if (messageIdStats && messageIdStats !== Number(user.messageId)) {
      await updateUserMessageId_db(userId, messageIdStats);
    }

    // if (
    //   inMemoryUsers[userId]?.performance !== undefined &&
    //   !inMemoryUsers[userId]?.status !== undefined
    // ) {
    //   // missed Attestations
    //   await notifyMissedAttestations(userId);

    //   // notify under performance
    //   await notifyUnderPerformance(userId);

    //   // notify validators status changed
    //   await notifyValidatorsActivityChanged(userId);
    // }
  });
}

export const updateUsersStats = new AsyncTask("notifyUser", () =>
  updateUsersStatsImp().catch((error) => handleError(error))
);
