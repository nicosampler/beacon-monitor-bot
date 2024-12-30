import { InlineKeyboard } from "grammy";
import { sendMessage } from "@/src/telegram/utils/messaging.js";
import {
  updateUserById_db,
  getOpenIncident_db,
  createIncident_db,
  updateIncidentData_db,
  closeIncident_db,
} from "@/src/prisma/users.js";
import { isNotificationAllowed } from "@/src/utils/misc.js";
import { ALERT_REPEAT_INTERVAL_MINUTES } from "@/src/constants/index.js";
import { User } from "@prisma/client";
import { IncidentType, PerformanceIncidentData } from "@/src/types.js";

export async function processUserPerformance(user: User, performance: number) {
  const {
    performanceNotif,
    performanceThreshold: _performanceThreshold,
    internalId,
  } = user;

  const performanceThreshold = _performanceThreshold || 90;

  // Check if there's an open incident
  const openIncident = await getOpenIncident_db(
    internalId,
    IncidentType.PERFORMANCE
  );

  // if performance is above threshold, close incident
  if (performance >= performanceThreshold) {
    if (openIncident) {
      await closeIncident_db(openIncident.id);
    }
    return;
  }

  const incidentData: PerformanceIncidentData = {
    currentPerformance: performance,
    threshold: performanceThreshold,
  };

  if (openIncident) {
    // Update if new performance is lower
    const currentData = openIncident.data as unknown as PerformanceIncidentData;
    if (performance < currentData.currentPerformance) {
      await updateIncidentData_db(openIncident.id, incidentData);
    }
  } else {
    // Create new incident
    await createIncident_db(internalId, IncidentType.PERFORMANCE, incidentData);
  }

  if (!isNotificationAllowed(performanceNotif, ALERT_REPEAT_INTERVAL_MINUTES)) {
    return;
  }

  const inlineKeyboard = new InlineKeyboard().text("OK", "remove_message");
  await sendMessage(
    user.chatId.toString(),
    `⚠️ Your validators performance has fallen below the threshold of ${performanceThreshold}%!`,
    { reply_markup: inlineKeyboard }
  );

  // update db user
  await updateUserById_db(Number(user.id), {
    performanceNotif: new Date(),
  });
}
