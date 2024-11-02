import { InlineKeyboard } from "grammy";
import { inMemoryUsers } from "@/src/utils/inMemoryDB.js";
import { sendMessage } from "@/src/telegram/utils/messaging.js";
import { getUser_db, updateUserById_db } from "@/src/prisma/users.js";
import { isNotificationAllowed } from "@/src/utils/misc.js";
import { ALERT_REPEAT_INTERVAL_MINUTES } from "@/src/constants/index.js";

export async function notifyValidatorsActivityChanged(userId: number) {
  // const user = inMemoryUsers[userId];
  // if (!user.status) return;
  // if (!user.status.inactiveIds.length) return;
  // // only notify once every 30 minutes
  // const dbUser = await getUser_db(userId);
  // if (
  //   !isNotificationAllowed(dbUser.statusNofi, ALERT_REPEAT_INTERVAL_MINUTES)
  // ) {
  //   return;
  // }
  // // send message
  // const inlineKeyboard = new InlineKeyboard().text("ok", "remove_message");
  // await sendMessage(Number(user.chatId), "⚠️ Some validators are not active!", {
  //   reply_markup: inlineKeyboard,
  // });
  // // update db user
  // await updateUserById_db(userId, {
  //   statusNofi: new Date(),
  // });
}
