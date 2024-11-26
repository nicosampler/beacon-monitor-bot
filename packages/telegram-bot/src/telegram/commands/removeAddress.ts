import { MyContext } from "@/src/config/session.js";
import { getFeeRewardAddresses_db } from "@/src/prisma/feeRewardAddresses.js";
import { deleteAddress } from "@/src/prisma/users.js";
import { getWithdrawalAddresses_db } from "@/src/prisma/withdrawalAddresses.js";
import { getDataFromContext } from "@/src/telegram/utils/getUserIdFromCtx.js";
import { editMessage, sendMessage } from "@/src/telegram/utils/messaging.js";
import { handleError } from "@/src/utils/errors/handleError.js";
import { Conversation } from "@grammyjs/conversations";
import { isAddress } from "ethers/lib/utils.js";

async function _waitForAddress(
  conversation: Conversation<MyContext>,
  ctx: MyContext
) {
  let validAddressEntered = false;
  let withdrawalAddress: string = "";

  while (!validAddressEntered) {
    const { message } = await conversation.wait();
    const input = message?.text?.trim() ?? "";

    if (input.toLowerCase() === "exit") {
      return;
    }

    // check if it is a valid eth address
    if (!isAddress(input)) {
      await ctx.reply(
        `Invalid address! Please try again. (type "exit" to abort)`
      );
      continue;
    } else {
      validAddressEntered = true;
      withdrawalAddress = input.toLowerCase();
    }
  }

  return withdrawalAddress;
}

export async function removeAddress(
  conversation: Conversation<MyContext>,
  ctx: MyContext
) {
  try {
    const { userId } = await getDataFromContext(ctx);

    const withdrawalAddresses = await getWithdrawalAddresses_db(userId);
    const feeRewardAddresses = await getFeeRewardAddresses_db(userId);

    // ask for the withdrawal address
    await ctx.reply(
      `Enter the address you want to remove. (type "exit" to abort)`
    );
    const address = await _waitForAddress(conversation, ctx);

    // check if the user has aborted the process
    if (address == undefined) {
      return;
    }

    // check if the address is not in the user's addresses
    if (
      !withdrawalAddresses.some((o) => o.address === address) &&
      !feeRewardAddresses.some((o) => o.address === address)
    ) {
      await sendMessage(userId, `The address is not in your account.`);
      return;
    }

    // Loading validators message
    let tmpReply = await ctx.reply(
      `Removing address ${address} from your account...`
    );

    await deleteAddress(userId, address);

    await editMessage(tmpReply, `Address removed from your account.`);
  } catch (error) {
    await handleError(error, ctx.message?.chat.id);
  }
}
