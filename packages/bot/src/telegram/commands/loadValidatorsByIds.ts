import { Conversation } from '@grammyjs/conversations';

import { addValidatorIds } from '@/src/api/user.js';
import { getPrisma } from '@/src/config/prisma.js';
import { MyContext } from '@/src/config/session.js';
import { getDataFromContext } from '@/src/telegram/utils/getUserIdFromCtx.js';
import { editMessageText } from '@/src/telegram/utils/messaging.js';
import { handleError } from '@/src/utils/errors/handleError.js';

const prisma = getPrisma();

type LoadValidatorsByIdsConversation = Conversation<MyContext>;

async function _waitForValidatorIds(conversation: LoadValidatorsByIdsConversation, ctx: MyContext) {
  let validIdsEntered = false;
  let validatorIds: number[] = [];

  while (!validIdsEntered) {
    const { message } = await conversation.wait();
    const input = message?.text?.trim() ?? '';

    if (input.toLowerCase() === 'exit') {
      return;
    }

    // Parse comma-separated validator IDs and remove spaces
    const ids = input
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    // Validate that all inputs are valid numbers
    const invalidIds = ids.filter((id) => !/^\d+$/.test(id));

    if (invalidIds.length > 0) {
      await ctx.reply(
        `❌ Invalid validator IDs found: ${invalidIds.join(', ')}\n` + `(type "exit" to abort)`,
      );
      continue;
    }

    // Convert to numbers
    validatorIds = ids.map((id) => parseInt(id, 10));

    if (validatorIds.length === 0) {
      await ctx.reply('Please enter at least one validator ID. (type "exit" to abort)');
      continue;
    }

    validIdsEntered = true;
  }

  return validatorIds;
}

export async function loadValidatorsByIds(
  conversation: LoadValidatorsByIdsConversation,
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

    // Ask for validator IDs
    await ctx.reply('Enter validator IDs separated by commas.\n' + 'Example: 12345, 67890, 11111.');

    const validatorIds = await _waitForValidatorIds(conversation, ctx);

    // Check if the user has aborted the process
    if (validatorIds == undefined) {
      return;
    }

    // Loading validators message
    const tmpReply = await ctx.reply(`🔄 Adding ${validatorIds.length} validators...`);

    try {
      // Call the API to add validator IDs
      await addValidatorIds(user.loginId, { validatorIds });

      await editMessageText(
        tmpReply.chat.id,
        tmpReply.message_id,
        `✅ Successfully added ${validatorIds.length} validators to your account!\n` +
          `- It will take some minutes to start providing stats -`,
      );
    } catch (error) {
      await editMessageText(
        tmpReply.chat.id,
        tmpReply.message_id,
        `❌ Failed to add validators: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  } catch (error) {
    await handleError(error, ctx.message?.chat.id);
  }
}
