import { createConversation } from '@grammyjs/conversations';
import { MenuTemplate, createBackMainMenuButtons } from 'grammy-inline-menu';

import { BotType } from '@/src/config/index.js';
import { MyContext } from '@/src/config/session.js';
import { loadFeeRewardAddress } from '@/src/telegram/commands/loadFeeRewardAddress.js';
//import { loadValidators } from '@/src/telegram/commands/loadValidators.js';
//import { myAddresses } from '@/src/telegram/commands/myWithdrawalAddresses.js';
import { removeAddress } from '@/src/telegram/commands/removeAddress.js';
import { createLoadValidatorsMenu } from '@/src/telegram/menus/loadValidatorsMenu.js';
import { sendMessage } from '@/src/telegram/utils/messaging.js';
import { handleError } from '@/src/utils/errors/handleError.js';

export function createValidatorsMenu(bot: BotType) {
  const validatorsMenu = new MenuTemplate<MyContext>('🕵🏽‍♂️ Validators management ');

  // Load Validators submenu
  const loadValidatorsSubmenu = createLoadValidatorsMenu(bot);
  validatorsMenu.submenu('loadValidators', loadValidatorsSubmenu, {
    text: 'Load Validators',
    hide: () => false,
  });

  //  validatorsMenu.interact('myAddresses', {
  //    text: 'My addresses',
  //    do: async (context) => {
  //      await myAddresses(context);
  //      return true;
  //    },
  //  });

  validatorsMenu.interact('loadFeeRewardAddress', {
    text: 'Set Fee Rewards address (EL)',
    do: async (ctx) => {
      try {
        if (ctx.from?.is_bot) {
          await sendMessage(ctx.from.id, 'This command is not available for bots.');
          return true;
        }
        await ctx.conversation.enter(loadFeeRewardAddress.name);
        return true;
      } catch (error) {
        await handleError(error);
        return true;
      }
    },
  });

  validatorsMenu.manualRow(createBackMainMenuButtons());

  bot.use(createConversation(loadFeeRewardAddress));
  bot.use(createConversation(removeAddress));

  return validatorsMenu;
}
