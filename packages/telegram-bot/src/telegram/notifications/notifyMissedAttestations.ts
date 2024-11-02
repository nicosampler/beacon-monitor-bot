import { InlineKeyboard } from "grammy";
import { inMemoryUsers } from "@/src/utils/inMemoryDB.js";
import { sendMessage } from "@/src/telegram/utils/messaging.js";
import { getUser_db, updateUserById_db } from "@/src/prisma/users.js";
import { isNotificationAllowed } from "@/src/utils/misc.js";
import { ALERT_REPEAT_INTERVAL_MINUTES } from "@/src/constants/index.js";

export async function notifyMissedAttestations(userId: number) {
  const dbUser = await getUser_db(userId);
  const threshold = dbUser.attestationThreshold;

  // const user = inMemoryUsers[userId];
  // if (!user.validatorsWithMissedAttestations?.length) return;

  // // filter validators that are inactive
  // // filter validators that have missed more than the threshold
  // const missedAttestations = user.validatorsWithMissedAttestations
  //   ?.filter((data) => !user.status?.inactiveIds.includes(data.id))
  //   .filter((data) => data.amount > threshold);

  // const amount = missedAttestations?.length;
  // if (!amount) return;

  // if (
  //   !missedAttestations.length ||
  //   !isNotificationAllowed(
  //     dbUser.attestationsNotif,
  //     ALERT_REPEAT_INTERVAL_MINUTES
  //   )
  // ) {
  //   return;
  // }

  // // send message
  // const inlineKeyboard = new InlineKeyboard().text("ok", "remove_message");
  // await sendMessage(
  //   user.chatId,
  //   `⚠️ There are validators that have missed the last ${threshold} attestations!`,
  //   { reply_markup: inlineKeyboard }
  // );

  // // update db user
  // await updateUserById_db(userId, {
  //   attestationsNotif: new Date(),
  // });
}
