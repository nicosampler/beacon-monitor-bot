import { updateUserMessageId_db } from "@/src/prisma/users";
import { notifyMissedAttestations } from "@/src/telegram/notifications/notifyMissedAttestations";
import { notifyUnderPerformance } from "@/src/telegram/notifications/notifyUnderPerformance";
import { notifyUserStatsMessage } from "@/src/telegram/notifications/notifyUserStatsMessage";
import { notifyValidatorsActivityChanged } from "@/src/telegram/notifications/notifyValidatorsActivityChanged";
import { handleError } from "@/src/utils/errors/handleError";
import { inMemoryUsers } from "@/src/utils/inMemoryDB";
import { AsyncTask } from "toad-scheduler";

export async function updateUsersStatsImp(userId?: number) {
  const users = userId ? { [userId]: inMemoryUsers[userId] } : inMemoryUsers;

  Object.values(users).forEach(async (user) => {
    const userId = Number(user.id);

    // stats notification
    const messageIdStats = await notifyUserStatsMessage(userId);
    if (messageIdStats && messageIdStats !== Number(user.messageId)) {
      user.messageId = messageIdStats;
      await updateUserMessageId_db(userId, messageIdStats);
    }

    if (
      inMemoryUsers[userId]?.performance !== undefined &&
      !inMemoryUsers[userId]?.status !== undefined
    ) {
      // missed Attestations
      await notifyMissedAttestations(userId);

      // notify under performance
      await notifyUnderPerformance(userId);

      // notify validators status changed
      await notifyValidatorsActivityChanged(userId);
    }
  });
}

export const updateUsersStats = new AsyncTask("notifyUser", () =>
  updateUsersStatsImp().catch((error) => handleError(error))
);
