import { createConversation } from '@grammyjs/conversations';
import { MenuTemplate, createBackMainMenuButtons } from 'grammy-inline-menu';

import { BotType } from '@/src/config/index.js';
import { MyContext } from '@/src/config/session.js';
import { removeValidatorsByAddress } from '@/src/telegram/commands/removeValidatorsByAddress.js';
import { removeValidatorsByIds } from '@/src/telegram/commands/removeValidatorsByIds.js';
import { removeValidatorsByLidoOperator } from '@/src/telegram/commands/removeValidatorsByLidoOperator.js';
import { sendMessage } from '@/src/telegram/utils/messaging.js';
import { handleError } from '@/src/utils/errors/handleError.js';

export function createRemoveValidatorsMenu(bot: BotType) {
  const removeValidatorsMenu = new MenuTemplate<MyContext>('🗑️ Remove Validators');

  removeValidatorsMenu.interact('byIds', {
    text: 'By Validator IDs',
    do: async (ctx) => {
      try {
        if (ctx.from?.is_bot) {
          await sendMessage(ctx.from.id, 'This command is not available for bots.');
          return true;
        }
        await ctx.conversation.enter(removeValidatorsByIds.name);
        return true;
      } catch (error) {
        await handleError(error);
        return true;
      }
    },
  });

  removeValidatorsMenu.interact('byAddress', {
    text: 'By Withdrawal Address',
    do: async (ctx) => {
      try {
        if (ctx.from?.is_bot) {
          await sendMessage(ctx.from.id, 'This command is not available for bots.');
          return true;
        }
        await ctx.conversation.enter(removeValidatorsByAddress.name);
        return true;
      } catch (error) {
        await handleError(error);
        return true;
      }
    },
  });

  removeValidatorsMenu.interact('byLidoOperatorId', {
    text: 'By Lido Operator ID',
    do: async (ctx) => {
      try {
        if (ctx.from?.is_bot) {
          await sendMessage(ctx.from.id, 'This command is not available for bots.');
          return true;
        }
        await ctx.conversation.enter(removeValidatorsByLidoOperator.name);
        return true;
      } catch (error) {
        await handleError(error);
        return true;
      }
    },
  });

  removeValidatorsMenu.manualRow(createBackMainMenuButtons());

  bot.use(createConversation(removeValidatorsByIds));
  bot.use(createConversation(removeValidatorsByAddress));
  bot.use(createConversation(removeValidatorsByLidoOperator));

  return removeValidatorsMenu;
}
