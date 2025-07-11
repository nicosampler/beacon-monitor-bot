import { Conversation } from '@grammyjs/conversations';
import { isAddress } from 'ethers/lib/utils.js';

import { removeWithdrawalAddresses } from '@/src/api/user.js';
import { getPrisma } from '@/src/config/prisma.js';
import { MyContext } from '@/src/config/session.js';
import { getDataFromContext } from '@/src/telegram/utils/getUserIdFromCtx.js';
import { editMessageText } from '@/src/telegram/utils/messaging.js';
import { handleError } from '@/src/utils/errors/handleError.js';

const prisma = getPrisma();

type RemoveValidatorsByAddressConversation = Conversation<MyContext>;

async function _waitForWithdrawalAddresses(
  conversation: RemoveValidatorsByAddressConversation,
  ctx: MyContext,
) {
  let validAddressesEntered = false;
  let withdrawalAddresses: string[] = [];

  while (!validAddressesEntered) {
    const { message } = await conversation.wait();
    const input = message?.text?.trim() ?? '';

    if (input.toLowerCase() === 'exit') {
      return;
    }

    // Parse comma-separated addresses and remove spaces
    const addresses = input
      .split(',')
      .map((address) => address.trim())
      .filter((address) => address.length > 0);

    // Validate that all inputs are valid Ethereum addresses
    const invalidAddresses = addresses.filter((address) => !isAddress(address));

    if (invalidAddresses.length > 0) {
      await ctx.reply(
        `❌ Invalid Ethereum addresses found: ${invalidAddresses.join(', ')}\n` +
          `(type "exit" to abort)`,
      );
      continue;
    }

    // Convert to lowercase for consistency
    withdrawalAddresses = addresses.map((address) => address.toLowerCase());

    if (withdrawalAddresses.length === 0) {
      await ctx.reply('Please enter at least one withdrawal address. (type "exit" to abort)');
      continue;
    }

    validAddressesEntered = true;
  }

  return withdrawalAddresses;
}

export async function removeValidatorsByAddress(
  conversation: RemoveValidatorsByAddressConversation,
  ctx: MyContext,
) {
  try {
    // Get user data
    const { userId } = await getDataFromContext(ctx);

    const user = await prisma.user.findUnique({
      where: { userId },
      include: { validators: true, withdrawalAddresses: true },
    });

    if (!user) {
      await ctx.reply('User not found');
      return;
    }

    // Ask for withdrawal addresses
    await ctx.reply(
      'Enter withdrawal addresses to remove, separated by commas.\n' +
        'Example: 0x1234..., 0x5678..., 0x9abc...',
    );

    const withdrawalAddresses = await _waitForWithdrawalAddresses(conversation, ctx);

    // Check if the user has aborted the process
    if (withdrawalAddresses == undefined) {
      return;
    }

    // Loading validators message
    const tmpReply = await ctx.reply(
      `🔄 Removing validators associated with ${withdrawalAddresses.length} withdrawal addresses...`,
    );

    try {
      // Call the API to remove withdrawal addresses
      await removeWithdrawalAddresses(user.loginId, {
        addresses: withdrawalAddresses,
      });

      await editMessageText(
        tmpReply.chat.id,
        tmpReply.message_id,
        `✅ Successfully removed validators for ${withdrawalAddresses.length} withdrawal addresses!\n` +
          `- It will take some minutes to refresh the stats -`,
      );
    } catch (error) {
      await editMessageText(
        tmpReply.chat.id,
        tmpReply.message_id,
        `❌ Failed to remove withdrawal addresses: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  } catch (error) {
    await handleError(error, ctx.message?.chat.id);
  }
}
