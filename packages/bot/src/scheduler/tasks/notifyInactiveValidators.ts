import { User } from '@prisma/client';
import { InlineKeyboard } from 'grammy';

import { ALERT_REPEAT_INTERVAL_MINUTES } from '@/src/constants/index.js';
import { env } from '@/src/env.js';
import { getUserOrFail_db, updateUserById_db } from '@/src/prisma/users.js';
import { sendMessage } from '@/src/telegram/utils/messaging.js';
import { isNotificationAllowed } from '@/src/utils/misc.js';
import { escapeMarkdown } from '@/src/utils/telegram.js';

export async function notifyInactiveValidators(user: User, inactiveIds: number[]) {
  if (!inactiveIds.length) return;

  // only notify once every 30 minutes
  const dbUser = await getUserOrFail_db(Number(user.id));
  if (!isNotificationAllowed(dbUser.inactiveNotif, ALERT_REPEAT_INTERVAL_MINUTES)) {
    return;
  }

  // send message
  const inlineKeyboard = new InlineKeyboard().text('ok', 'remove_message');
  const dashboardUrl = `${env.NODE_SENTINEL_URL}/${env.NODE_SENTINEL_CHAIN}/dashboard/${user.loginId}`;
  const message = `⚠️ Some validators are not active!\n\n📊 [Validators dashboard](${dashboardUrl})`;
  await sendMessage(Number(user.chatId), escapeMarkdown(message), {
    reply_markup: inlineKeyboard,
    parse_mode: 'MarkdownV2',
    link_preview_options: {
      is_disabled: true,
    },
  });
  // update db user
  await updateUserById_db(Number(user.id), {
    inactiveNotif: new Date(),
  });
}
