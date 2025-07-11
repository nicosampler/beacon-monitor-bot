import { createConversation } from '@grammyjs/conversations';
import { MenuTemplate, createBackMainMenuButtons } from 'grammy-inline-menu';

import { BotType } from '@/src/config/index.js';
import { MyContext } from '@/src/config/session.js';
import { loadValidatorsByAddress } from '@/src/telegram/commands/loadValidatorsByAddress.js';
import { loadValidatorsByIds } from '@/src/telegram/commands/loadValidatorsByIds.js';
import { sendMessage } from '@/src/telegram/utils/messaging.js';
import { handleError } from '@/src/utils/errors/handleError.js';

export function createLoadValidatorsMenu(bot: BotType) {
  const loadValidatorsMenu = new MenuTemplate<MyContext>('Load Validators');

  loadValidatorsMenu.interact('byIds', {
    text: 'By Validator IDs',
    do: async (ctx) => {
      try {
        if (ctx.from?.is_bot) {
          await sendMessage(ctx.from.id, 'This command is not available for bots.');
          return true;
        }
        await ctx.conversation.enter(loadValidatorsByIds.name);
        return true;
      } catch (error) {
        await handleError(error);
        return true;
      }
    },
  });

  loadValidatorsMenu.interact('byAddress', {
    text: 'By Withdrawal Address',
    do: async (ctx) => {
      try {
        if (ctx.from?.is_bot) {
          await sendMessage(ctx.from.id, 'This command is not available for bots.');
          return true;
        }
        await ctx.conversation.enter(loadValidatorsByAddress.name);
        return true;
      } catch (error) {
        await handleError(error);
        return true;
      }
    },
  });

  loadValidatorsMenu.manualRow(createBackMainMenuButtons());

  bot.use(createConversation(loadValidatorsByIds));
  bot.use(createConversation(loadValidatorsByAddress));

  return loadValidatorsMenu;
}
