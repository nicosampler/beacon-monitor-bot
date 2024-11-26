import { MenuMiddleware, MenuTemplate } from "grammy-inline-menu";

import { BotType } from "@/src/config/index.js";
import { MyContext } from "@/src/config/session.js";
import { dashboard } from "@/src/telegram/commands/dashboard.js";
import { createAlertingMenu } from "@/src/telegram/menus/alertingMenu.js";
import { createUserMenu } from "@/src/telegram/menus/userMenu.js";
import { createValidatorsMenu } from "@/src/telegram/menus/validatorsMenu.js";

export function registerMainMenu(bot: BotType) {
  let menuToggle = false;
  const menu = new MenuTemplate<MyContext>("Main menu");

  // bot.command("dashboard", dashboard);
  // menu.interact("Dashboard", {
  //   text: "📊 Dashboard",
  //   do: async (ctx) => {
  //     await dashboard(ctx);
  //     return true;
  //   },
  // });

  // Validators menu
  const validatorsMenu = createValidatorsMenu(bot);
  menu.submenu("validators", validatorsMenu, {
    text: "🕵🏽‍♂️ Validators management",
    hide: () => menuToggle,
  });

  // Alerting menu
  const alertingMenu = createAlertingMenu(bot);
  menu.submenu("alerting", alertingMenu, {
    text: "🔔 Configure alerts",
    hide: () => menuToggle,
  });

  // User menu
  const userSubmenu = createUserMenu(bot);
  menu.submenu("userConfig", userSubmenu, {
    text: "👤 User management",
    hide: () => menuToggle,
  });

  // Support link
  menu.url({
    text: "🆘 Support channel",
    url: "https://t.me/GBC_validators_bot_support",
  });

  // settings menu
  const menuMiddleware = new MenuMiddleware<MyContext>("/", menu);
  bot.use(menuMiddleware.middleware());
  bot.command("menu", async (ctx) => menuMiddleware.replyToContext(ctx));
}
