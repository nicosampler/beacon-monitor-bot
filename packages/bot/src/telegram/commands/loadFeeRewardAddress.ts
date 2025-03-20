import { Conversation } from '@grammyjs/conversations';
import { isAddress } from 'ethers/lib/utils.js';

import { MyContext } from '@/src/config/session.js';
import { updateUserById_db } from '@/src/prisma/users.js';
import { getDataFromContext } from '@/src/telegram/utils/getUserIdFromCtx.js';
import { sendMessage } from '@/src/telegram/utils/messaging.js';
import { handleError } from '@/src/utils/errors/handleError.js';

async function _waitForInput(conversation: Conversation<MyContext>, ctx: MyContext) {
  let validAddressEntered = false;
  let withdrawalAddress: string = '';

  while (!validAddressEntered) {
    const { message } = await conversation.wait();
    const input = message?.text?.trim() ?? '';

    if (input.toLowerCase() === 'exit') {
      return;
    }

    // check if it is a valid eth address
    if (!isAddress(input)) {
      await ctx.reply(`Invalid address! Please try again. (type "exit" to abort)`);
      continue;
    } else {
      validAddressEntered = true;
      withdrawalAddress = input.toLowerCase();
    }
  }

  return withdrawalAddress;
}

export async function loadFeeRewardAddress(conversation: Conversation<MyContext>, ctx: MyContext) {
  try {
    // ask for the withdrawal address
    await ctx.reply(`Enter an address. (type "exit" to abort)`);

    const address = await _waitForInput(conversation, ctx);

    // get uerId
    const { userId } = await getDataFromContext(ctx);

    // check if the user has aborted the process
    if (address == undefined) {
      return;
    }

    // Update DB
    await updateUserById_db(userId, {
      feeRewardAddresses: {
        connectOrCreate: {
          where: { address },
          create: { address },
        },
      },
    });

    // Send confirmation message
    await sendMessage(userId, `Fee reward address successfully added.`);
  } catch (error) {
    await handleError(error, ctx.message?.chat.id);
  }
}
