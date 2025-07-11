import { createConversation } from '@grammyjs/conversations';
import { MenuTemplate, createBackMainMenuButtons } from 'grammy-inline-menu';

import { BotType } from '@/src/config/index.js';
import { MyContext } from '@/src/config/session.js';
import { env } from '@/src/env.js';
import { claim } from '@/src/telegram/commands/claim.js';
import { loadFeeRewardAddress } from '@/src/telegram/commands/loadFeeRewardAddress.js';
import { loadValidators } from '@/src/telegram/commands/loadValidators.js';
import { myAddresses } from '@/src/telegram/commands/myWithdrawalAddresses.js';
import { removeAddress } from '@/src/telegram/commands/removeAddress.js';
import { createLoadValidatorsMenu } from '@/src/telegram/menus/loadValidatorsMenu.js';
import { sendMessage } from '@/src/telegram/utils/messaging.js';
import { handleError } from '@/src/utils/errors/handleError.js';

// loadValidators
// > by IDs
// > by withdrawal address

// removeValidator
// > by IDs
// > by withdrawal address

// Update Fee rewards Address (EL)

export function createValidatorsMenu(bot: BotType) {
  const validatorsMenu = new MenuTemplate<MyContext>('🕵🏽‍♂️ Validators management ');

  // Load Validators submenu
  const loadValidatorsSubmenu = createLoadValidatorsMenu(bot);
  validatorsMenu.submenu('loadValidators', loadValidatorsSubmenu, {
    text: 'Load Validators',
    hide: () => false,
  });

  if (env.NODE_SENTINEL_CHAIN === 'gnosis') {
    validatorsMenu.interact('myAddresses', {
      text: 'My addresses',
      do: async (context) => {
        await myAddresses(context);
        return true;
      },
    });
    validatorsMenu.interact('removeAddress', {
      text: 'Remove address',
      do: async (ctx) => {
        try {
          if (ctx.from?.is_bot) {
            await sendMessage(ctx.from.id, 'This command is not available for bots.');
            return true;
          }
          await ctx.conversation.enter(removeAddress.name);
          return true;
        } catch (error) {
          await handleError(error);
          return true;
        }
      },
    });
    validatorsMenu.interact('loadWithdrawalAddress', {
      text: 'Add Withdrawal address',
      do: async (ctx) => {
        try {
          if (ctx.from?.is_bot) {
            await sendMessage(ctx.from.id, 'This command is not available for bots.');
            return true;
          }
          await ctx.conversation.enter(loadValidators.name);
          return true;
        } catch (error) {
          await handleError(error);
          return true;
        }
      },
    });
  }

  validatorsMenu.interact('loadFeeRewardAddress', {
    text: 'Add fee reward address',
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

  if (env.NODE_SENTINEL_CHAIN === 'gnosis') {
    validatorsMenu.interact('claimRewards', {
      text: 'Claim rewards 🤑',
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

  validatorsMenu.manualRow(createBackMainMenuButtons());

  bot.use(createConversation(loadValidators));
  bot.use(createConversation(loadFeeRewardAddress));
  bot.use(createConversation(removeAddress));

  return validatorsMenu;
}
