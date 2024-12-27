import { InlineKeyboard } from "grammy";
import { sendMessage } from "@/src/telegram/utils/messaging.js";
import {
  getUser_db,
  updateUserById_db,
  getOpenIncident_db,
  createIncident_db,
  updateIncidentData_db,
  closeIncident_db,
} from "@/src/prisma/users.js";
import { isNotificationAllowed } from "@/src/utils/misc.js";
import { ALERT_REPEAT_INTERVAL_MINUTES } from "@/src/constants/index.js";
import { User } from "@prisma/client";
import { IncidentType, InactiveIncidentData } from "@/src/types.js";

export async function processUserInactiveValidators(
  user: User,
  incident: { validatorId: number; slot: number }[]
) {
  const openIncident = await getOpenIncident_db(
    user.internalId,
    IncidentType.INACTIVE
  );
  if (!incident.length) {
    // Check if there's an open incident to close
    if (openIncident) {
      await closeIncident_db(openIncident.id);
    }
    return;
  }

  if (openIncident) {
    // Update existing incident with new validators
    const currentData = openIncident.data as unknown as InactiveIncidentData;
    const existingValidatorIds = new Set(
      currentData.validators.map((v) => v.validatorId)
    );

    const newValidators = incident
      .filter((inc) => !existingValidatorIds.has(inc.validatorId))
      .map((inc) => ({
        validatorId: inc.validatorId,
        startSlot: inc.slot,
      }));

    if (newValidators.length > 0) {
      const updatedData: InactiveIncidentData = {
        validators: [...currentData.validators, ...newValidators],
        threshold: user.inactiveOnMissedAttestations,
      };
      await updateIncidentData_db(openIncident.id, updatedData);
    }
  } else {
    // Create new incident
    const incidentData: InactiveIncidentData = {
      validators: incident.map((inc) => ({
        validatorId: inc.validatorId,
        startSlot: inc.slot,
      })),
      threshold: user.inactiveOnMissedAttestations,
    };
    await createIncident_db(
      user.internalId,
      IncidentType.INACTIVE,
      incidentData
    );
  }

  // only notify once every 30 minutes
  const dbUser = await getUser_db(Number(user.id));
  if (
    !isNotificationAllowed(dbUser.inactiveNotif, ALERT_REPEAT_INTERVAL_MINUTES)
  ) {
    return;
  }

  // send message
  const inlineKeyboard = new InlineKeyboard().text("ok", "remove_message");
  await sendMessage(Number(user.chatId), "⚠️ Some validators are not active!", {
    reply_markup: inlineKeyboard,
  });

  // update db user
  await updateUserById_db(Number(user.id), {
    inactiveNotif: new Date(),
  });
}
