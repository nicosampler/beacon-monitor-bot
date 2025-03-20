import { User } from '@prisma/client';
import { InlineKeyboard } from 'grammy';

import { ALERT_REPEAT_INTERVAL_MINUTES } from '@/src/constants/index.js';
import { getUser_db, updateUserById_db } from '@/src/prisma/users.js';
import { sendMessage } from '@/src/telegram/utils/messaging.js';
import { isNotificationAllowed } from '@/src/utils/misc.js';

export async function notifyInactiveValidators(user: User, inactiveIds: number[]) {
  if (!inactiveIds.length) return;

  // only notify once every 30 minutes
  const dbUser = await getUser_db(Number(user.id));
  if (!isNotificationAllowed(dbUser.inactiveNotif, ALERT_REPEAT_INTERVAL_MINUTES)) {
    return;
  }
  // send message
  const inlineKeyboard = new InlineKeyboard().text('ok', 'remove_message');
  await sendMessage(Number(user.chatId), '⚠️ Some validators are not active!', {
    reply_markup: inlineKeyboard,
  });
  // update db user
  await updateUserById_db(Number(user.id), {
    inactiveNotif: new Date(),
  });
}
