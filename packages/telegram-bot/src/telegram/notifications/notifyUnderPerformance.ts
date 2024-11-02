import { InlineKeyboard } from "grammy";
import { inMemoryUsers } from "@/src/utils/inMemoryDB.js";
import { sendMessage } from "@/src/telegram/utils/messaging.js";
import { getUser_db, updateUserById_db } from "@/src/prisma/users.js";
import { isNotificationAllowed } from "@/src/utils/misc.js";
import { ALERT_REPEAT_INTERVAL_MINUTES } from "@/src/constants/index.js";

export async function notifyUnderPerformance(userId: number) {
  // const user = inMemoryUsers[userId];
  // const { last100AttestedPercentage, chatId } = user;
  // const dbUser = await getUser_db(userId);
  // const threshold = dbUser.performanceThreshold;
  // if (!last100AttestedPercentage || last100AttestedPercentage >= threshold) {
  //   return;
  // }
  // if (
  //   !isNotificationAllowed(
  //     dbUser.performanceNotif,
  //     ALERT_REPEAT_INTERVAL_MINUTES
  //   )
  // ) {
  //   return;
  // }
  // const inlineKeyboard = new InlineKeyboard().text("OK", "remove_message");
  // await sendMessage(
  //   chatId,
  //   `⚠️ Your validators performance has fallen below the threshold of ${threshold}%!`,
  //   { reply_markup: inlineKeyboard }
  // );
  // // update db user
  // await updateUserById_db(userId, {
  //   performanceNotif: new Date(),
  // });
}
