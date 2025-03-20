import 'dotenv/config';

import { conversations, createConversation } from '@grammyjs/conversations';
import { session } from 'grammy';

import { scheduleUsersTasks } from './scheduler/index.js';
import { botStats } from './telegram/commands/botStats.js';
import { help } from './telegram/commands/help.js';

import { bot } from '@/src/config/index.js';
import { getPrisma } from '@/src/config/prisma.js';
import { getInitialSession } from '@/src/config/session.js';
import { setUserUnblockedBot_db } from '@/src/prisma/users.js';
import { dashboard } from '@/src/telegram/commands/dashboard.js';
import { headsUp } from '@/src/telegram/commands/headsUp.js';
import { sendBill } from '@/src/telegram/commands/sendBill.js';
import { registerMainMenu } from '@/src/telegram/menus/index.js';
import { removeMessage } from '@/src/telegram/utils/messaging.js';
// import { webDashboard } from "@/src/telegram/commands/webDashboard.js";

const prisma = getPrisma();

async function main() {
  await prisma.$connect();

  scheduleUsersTasks();

  // unblock user when they interact with the bot
  bot.use(async (ctx, next) => {
    if (ctx.from?.id) {
      try {
        await setUserUnblockedBot_db(ctx.from.id);
      } catch (error) {
        console.error(`Error unblocking user ${ctx.from.id}: ${error}.`);
      }
    }
    return next();
  });

  // Plugins
  bot.use(session({ initial: getInitialSession }));
  bot.use(conversations());

  // conversations
  bot.use(createConversation(headsUp));

  // commands
  registerMainMenu(bot);
  bot.command('dashboard', dashboard);
  //bot.command("web_dashboard", webDashboard);
  // unlisted commands
  bot.command('start', help);
  bot.command('bot_stats', botStats);
  bot.command('heads_up', async (ctx) => {
    await ctx.conversation.enter(headsUp.name);
  });
  bot.command('send_bill', sendBill);

  // Callbacks
  bot.callbackQuery('remove_message', (ctx) => {
    if (!ctx.chat?.id || !ctx.msg?.message_id) return;
    removeMessage(ctx.chat.id, ctx.msg.message_id);
  });

  // handle unknown commands.
  bot.on(':text', (ctx) => ctx.reply('Unknown command!'));

  await bot.api.setChatMenuButton();

  // native TG menu options
  await bot.api.setMyCommands([
    {
      command: 'dashboard',
      description: 'present the dashboard',
    },
    {
      command: 'web_dashboard',
      description: 'Extended dashboard',
    },
    {
      command: 'menu',
      description: 'Show the main menu',
    },
  ]);

  bot.start();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
