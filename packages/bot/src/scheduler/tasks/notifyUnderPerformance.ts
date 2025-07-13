import { User } from '@prisma/client';
import { InlineKeyboard } from 'grammy';

import { ALERT_REPEAT_INTERVAL_MINUTES } from '@/src/constants/index.js';
import { env } from '@/src/env.js';
import { updateUserById_db } from '@/src/prisma/users.js';
import { sendMessage } from '@/src/telegram/utils/messaging.js';
import { isNotificationAllowed } from '@/src/utils/misc.js';
import { escapeMarkdown } from '@/src/utils/telegram.js';

export async function notifyUnderPerformance(user: User, performance: number) {
  const { performanceNotif, performanceThreshold } = user;

  if (!performanceThreshold || performance > performanceThreshold) {
    return;
  }

  if (!isNotificationAllowed(performanceNotif, ALERT_REPEAT_INTERVAL_MINUTES)) {
    return;
  }

  const inlineKeyboard = new InlineKeyboard().text('OK', 'remove_message');
  const dashboardUrl = `${env.NODE_SENTINEL_URL}/${env.NODE_SENTINEL_CHAIN}/dashboard/${user.loginId}`;
  const message = `⚠️ Your validator performance has dropped below ${performanceThreshold}%!\n\n📊 [Validators dashboard](${dashboardUrl})`;
  await sendMessage(user.chatId.toString(), escapeMarkdown(message), {
    reply_markup: inlineKeyboard,
    parse_mode: 'MarkdownV2',
    link_preview_options: {
      is_disabled: true,
    },
  });

  // update db user
  await updateUserById_db(Number(user.id), {
    performanceNotif: new Date(),
  });
}
