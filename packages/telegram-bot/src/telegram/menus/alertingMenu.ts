import { MenuTemplate, createBackMainMenuButtons } from "grammy-inline-menu";
import { createConversation } from "@grammyjs/conversations";

import { BotType } from "@/src/config/index.js";
import { MyContext } from "@/src/config/session.js";
import { performanceThreshold } from "@/src/telegram/commands/performanceThreshold.js";
import { inactiveOnMissedAttestations } from "@/src/telegram/commands/inactiveOnMissedAttestations.js";
import { clearAlertDelay_db } from "@/src/prisma/users.js";

export function createAlertingMenu(bot: BotType) {
  const alertingMenu = new MenuTemplate<MyContext>("🔔 Configure alerts");
  alertingMenu.interact("setPerformanceThreshold", {
    text: "🎢 Performance drop",
    do: async (context, path) => {
      await context.conversation.enter(performanceThreshold.name);
      return true;
    },
  });
  alertingMenu.interact("setInactiveOnMissedAttestationsThreshold", {
    text: "🟡 Inactive validators",
    do: async (context) => {
      await context.conversation.enter(inactiveOnMissedAttestations.name);
      return true;
    },
  });
  alertingMenu.interact("clearAlertDelay", {
    text: "🧹 Clear alert delay",
    do: async (context, path) => {
      await clearAlertDelay_db(context.from.id);
      return true;
    },
  });

  alertingMenu.manualRow(createBackMainMenuButtons());

  bot.use(createConversation(performanceThreshold));
  bot.use(createConversation(inactiveOnMissedAttestations));

  return alertingMenu;
}
