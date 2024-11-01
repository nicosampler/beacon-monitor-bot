import { MenuTemplate, createBackMainMenuButtons } from "grammy-inline-menu";
import { createConversation } from "@grammyjs/conversations";

import { BotType } from "@/src/config/index.js";
import { claim } from "@/src/telegram/commands/claim.js";
import { handleError } from "@/src/utils/errors/handleError.js";
import { loadValidators } from "@/src/telegram/commands/loadValidators.js";
import { MyContext } from "@/src/config/session.js";
import { myWithdrawalAddresses } from "@/src/telegram/commands/myWithdrawalAddresses.js";
import { sendMessage } from "@/src/telegram/utils/messaging.js";

export function createValidatorsMenu(bot: BotType) {
  const validatorsMenu = new MenuTemplate<MyContext>(
    "🕵🏽‍♂️ Validators management "
  );
  validatorsMenu.interact("loadAddress", {
    text: "Add Withdrawal address",
    do: async (ctx) => {
      if (ctx.from?.is_bot) {
        await sendMessage(
          ctx.from.id,
          "This command is not available for bots."
        );
        return true;
      }
      await ctx.conversation.enter(loadValidators.name);
      return true;
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
    text: "My withdrawal addresses",
    do: async (context) => {
      await myWithdrawalAddresses(context);
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
  validatorsMenu.manualRow(createBackMainMenuButtons());

  bot.use(createConversation(loadValidators));

  return validatorsMenu;
}
