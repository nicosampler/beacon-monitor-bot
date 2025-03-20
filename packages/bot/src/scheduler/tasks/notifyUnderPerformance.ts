import { User } from '@prisma/client';
import { InlineKeyboard } from 'grammy';

import { ALERT_REPEAT_INTERVAL_MINUTES } from '@/src/constants/index.js';
import { updateUserById_db } from '@/src/prisma/users.js';
import { sendMessage } from '@/src/telegram/utils/messaging.js';
import { isNotificationAllowed } from '@/src/utils/misc.js';

export async function notifyUnderPerformance(user: User, performance: number) {
  const { performanceNotif, performanceThreshold } = user;

  if (!performanceThreshold || performance > performanceThreshold) {
    return;
  }

  if (!isNotificationAllowed(performanceNotif, ALERT_REPEAT_INTERVAL_MINUTES)) {
    return;
  }

  const inlineKeyboard = new InlineKeyboard().text('OK', 'remove_message');
  await sendMessage(
    user.chatId.toString(),
    `⚠️ Your validators performance has fallen below the threshold of ${performanceThreshold}%!`,
    { reply_markup: inlineKeyboard },
  );

  // update db user
  await updateUserById_db(Number(user.id), {
    performanceNotif: new Date(),
  });
}
