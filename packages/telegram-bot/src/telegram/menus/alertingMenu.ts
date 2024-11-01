import { MenuTemplate, createBackMainMenuButtons } from "grammy-inline-menu";
import { createConversation } from "@grammyjs/conversations";

import { BotType } from "@/src/config/index.js";
import { MyContext } from "@/src/config/session.js";
import { performanceThreshold } from "@/src/telegram/commands/performanceThreshold.js";
import { attestationThreshold } from "@/src/telegram/commands/attestationsThreshold.js";

export function createAlertingMenu(bot: BotType) {
  const alertingMenu = new MenuTemplate<MyContext>("🔔 Configure alerts");
  alertingMenu.interact("setPerformanceThreshold", {
    text: "🎢 Performance drop",
    do: async (context, path) => {
      await context.conversation.enter(performanceThreshold.name);
      return true;
    },
  });
  alertingMenu.interact("setAttestationsThreshold", {
    text: "🙈 Missed attestations",
    do: async (context) => {
      await context.conversation.enter(attestationThreshold.name);
      return true;
    },
  });

  alertingMenu.manualRow(createBackMainMenuButtons());

  bot.use(createConversation(performanceThreshold));
  bot.use(createConversation(attestationThreshold));

  return alertingMenu;
}
