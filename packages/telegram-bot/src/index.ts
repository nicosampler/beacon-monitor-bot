import "dotenv/config";

import { session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";

import { scheduleUsersTasks } from "./scheduler/index.js";
import { botStats } from "./telegram/commands/botStats.js";
import { help } from "./telegram/commands/help.js";
import { getPrisma } from "@/src/config/prisma.js";
import { loadInMemoryUsers } from "@/src/utils/loadInMemoryUsers.js";
import { headsUp } from "@/src/telegram/commands/headsUp.js";
import { getInitialSession } from "@/src/config/session.js";
import { bot } from "@/src/config/index.js";
import { removeMessage } from "@/src/telegram/utils/messaging.js";
import { registerMainMenu } from "@/src/telegram/menus/index.js";

const prisma = getPrisma();

async function main() {
  //await loadInMemoryUsers();

  bot.start();

  scheduleUsersTasks();

  // Plugins
  bot.use(session({ initial: getInitialSession }));
  bot.use(conversations());
  bot.use(createConversation(headsUp));

  // commands
  bot.command("start", help);
  registerMainMenu(bot);

  // unlisted commands
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
      command: "menu",
      description: "Show the main menu",
    },
  ]);
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
