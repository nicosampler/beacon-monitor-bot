import "dotenv/config";

import { session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";

import { scheduleUsersTasks } from "./scheduler/index.js";
import { botStats } from "./telegram/commands/botStats.js";
import { help } from "./telegram/commands/help.js";
import { getPrisma } from "@/src/config/prisma.js";
import { headsUp } from "@/src/telegram/commands/headsUp.js";
import { getInitialSession } from "@/src/config/session.js";
import { bot } from "@/src/config/index.js";
import { removeMessage } from "@/src/telegram/utils/messaging.js";
import { registerMainMenu } from "@/src/telegram/menus/index.js";
import { dashboard } from "@/src/telegram/commands/dashboard.js";

const prisma = getPrisma();

async function main() {
  await prisma.$connect();

  scheduleUsersTasks();

  // Plugins
  bot.use(session({ initial: getInitialSession }));
  bot.use(conversations());

  // conversations
  bot.use(createConversation(headsUp));

  // commands
  registerMainMenu(bot);
  bot.command("dashboard", dashboard);

  // unlisted commands
  bot.command("start", help);
  bot.command("bot_stats", botStats);
  bot.command("heads_up", async (ctx) => {
    await ctx.conversation.enter(headsUp.name);
  });

  // Callbacks
  bot.callbackQuery("remove_message", (ctx) => {
    if (!ctx.chat?.id || !ctx.msg?.message_id) return;
    removeMessage(ctx.chat.id, ctx.msg.message_id);
  });

  // handle unknown commands.
  bot.on(":text", (ctx) => ctx.reply("Unknown command!"));

  // native TG menu options
  await bot.api.setMyCommands([
    {
      command: "dashboard",
      description: "present the dashboard",
    },
    {
      command: "menu",
      description: "Show the main menu",
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
