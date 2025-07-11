import { MenuMiddleware, MenuTemplate } from 'grammy-inline-menu';

import { BotType } from '@/src/config/index.js';
import { MyContext } from '@/src/config/session.js';
import { env } from '@/src/env.js';
import { claim } from '@/src/telegram/commands/claim.js';
import { createAlertingMenu } from '@/src/telegram/menus/alertingMenu.js';
import { createUserMenu } from '@/src/telegram/menus/userMenu.js';
import { createValidatorsMenu } from '@/src/telegram/menus/validatorsMenu.js';
import { handleError } from '@/src/utils/errors/handleError.js';

export function registerMainMenu(bot: BotType) {
  const menuToggle = false;
  const menu = new MenuTemplate<MyContext>('Main menu');

  // bot.command("dashboard", dashboard);
  // menu.interact("Dashboard", {
  //   text: "📊 Dashboard",
  //   do: async (ctx) => {
  //     await dashboard(ctx);
  //     return true;
  //   },
  // });

  // Claim rewards (only for Gnosis)
  if (env.NODE_SENTINEL_CHAIN === 'gnosis') {
    menu.interact('claimRewards', {
      text: '🤑 Claim rewards',
      do: async (context) => {
        try {
          await claim(context);
        } catch (error) {
          await handleError(error, context.chat?.id);
        }
        return true;
      },
    });
  }

  // Validators menu
  const validatorsMenu = createValidatorsMenu(bot);
  menu.submenu('validators', validatorsMenu, {
    text: '🕵🏽‍♂️ Validators',
    hide: () => menuToggle,
  });

  // Alerting menu
  const alertingMenu = createAlertingMenu(bot);
  menu.submenu('alerting', alertingMenu, {
    text: '🔔 Alerts',
    hide: () => menuToggle,
  });

  // User menu
  const userSubmenu = createUserMenu();
  menu.submenu('userConfig', userSubmenu, {
    text: '👤 Profile',
    hide: () => menuToggle,
  });

  // Support link
  menu.url({
    text: '🆘 Support',
    url: 'https://t.me/node_sentinel',
  });

  // settings menu
  const menuMiddleware = new MenuMiddleware<MyContext>('/', menu);
  bot.use(menuMiddleware.middleware());
  bot.command('menu', async (ctx) => menuMiddleware.replyToContext(ctx));
}
