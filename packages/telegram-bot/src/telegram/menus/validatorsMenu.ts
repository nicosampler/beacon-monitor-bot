import { MenuTemplate, createBackMainMenuButtons } from "grammy-inline-menu";
import { createConversation } from "@grammyjs/conversations";

import { BotType } from "@/src/config/index.js";
import { claim } from "@/src/telegram/commands/claim.js";
import { handleError } from "@/src/utils/errors/handleError.js";
import { loadValidators } from "@/src/telegram/commands/loadValidators.js";
import { MyContext } from "@/src/config/session.js";
import { sendMessage } from "@/src/telegram/utils/messaging.js";
import { myAddresses } from "@/src/telegram/commands/myWithdrawalAddresses.js";
import { loadFeeRewardAddress } from "@/src/telegram/commands/loadFeeRewardAddress.js";
import { removeAddress } from "@/src/telegram/commands/removeAddress.js";

export function createValidatorsMenu(bot: BotType) {
  const validatorsMenu = new MenuTemplate<MyContext>(
    "🕵🏽‍♂️ Validators management "
  );
  validatorsMenu.interact("loadWithdrawalAddress", {
    text: "Add Withdrawal address",
    do: async (ctx) => {
      try {
        if (ctx.from?.is_bot) {
          await sendMessage(
            ctx.from.id,
            "This command is not available for bots."
          );
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
  validatorsMenu.interact("loadFeeRewardAddress", {
    text: "Add fee reward address",
    do: async (ctx) => {
      try {
        if (ctx.from?.is_bot) {
          await sendMessage(
            ctx.from.id,
            "This command is not available for bots."
          );
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
  validatorsMenu.interact("claimRewards", {
    text: "Claim rewards 🤑",
    do: async (context) => {
      try {
        await claim(context);
      } catch (error) {
        await handleError(error, context.chat?.id);
      }
      return true;
    },
  });
  validatorsMenu.interact("myAddresses", {
    text: "My addresses",
    do: async (context) => {
      await myAddresses(context);
      return true;
    },
  });
  // validatorsMenu.interact("checkNewValidators", {
  //   text: "Check for new validators",
  //   do: async (context, path) => {
  //     return true;
  //   },
  // });
  // validatorsMenu.interact("removeAddress", {
  //   text: "Delete withdrawal address",
  //   do: async (context, path) => {
  //     return true;
  //   },
  // });
  validatorsMenu.interact("removeAddress", {
    text: "Remove address",
    do: async (ctx) => {
      try {
        if (ctx.from?.is_bot) {
          await sendMessage(
            ctx.from.id,
            "This command is not available for bots."
          );
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
  validatorsMenu.manualRow(createBackMainMenuButtons());

  bot.use(createConversation(loadValidators));
  bot.use(createConversation(loadFeeRewardAddress));
  bot.use(createConversation(removeAddress));

  return validatorsMenu;
}
