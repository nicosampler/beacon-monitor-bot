import { Conversation } from '@grammyjs/conversations';

import { addLidoOperatorValidators } from '@/src/api/user.js';
import { getPrisma } from '@/src/config/prisma.js';
import { MyContext } from '@/src/config/session.js';
import { getDataFromContext } from '@/src/telegram/utils/getUserIdFromCtx.js';
import { editMessageText } from '@/src/telegram/utils/messaging.js';
import { handleError } from '@/src/utils/errors/handleError.js';
import { getOperatorActivePubkeys } from '@/src/utils/lido/getOperatorActivePubkeys.js';

const prisma = getPrisma();

type UserWithRelations = {
  loginId: string;
  lidoOperatorId: string | null;
  validators: unknown[];
  withdrawalAddresses: unknown[];
};

type LoadValidatorsByLidoOperatorConversation = Conversation<MyContext>;

async function _waitForLidoOperatorId(
  conversation: LoadValidatorsByLidoOperatorConversation,
  ctx: MyContext,
): Promise<number | undefined> {
  let validIdEntered = false;
  let operatorId: number | undefined;

  while (!validIdEntered) {
    const { message } = await conversation.wait();
    const input = message?.text?.trim() ?? '';

    if (input.toLowerCase() === 'exit') {
      return;
    }

    if (!/^\d+$/.test(input)) {
      await ctx.reply('Please enter a valid numeric Lido CSM Id. (type "exit" to abort)');
      continue;
    }

    operatorId = Number(input);

    if (!Number.isSafeInteger(operatorId) || operatorId < 0) {
      await ctx.reply('Please enter a valid positive Lido CSM Id. (type "exit" to abort)');
      continue;
    }

    validIdEntered = true;
  }

  return operatorId;
}

export async function loadValidatorsByLidoOperator(
  conversation: LoadValidatorsByLidoOperatorConversation,
  ctx: MyContext,
) {
  try {
    const { userId } = await getDataFromContext(ctx);

    const user = (await prisma.user.findUnique({
      where: { userId },
      include: { validators: true, withdrawalAddresses: true },
    })) as UserWithRelations | null;

    if (!user) {
      await ctx.reply('User not found');
      return;
    }

    const loginId = user.loginId;
    const currentLidoOperatorId = user.lidoOperatorId;

    await ctx.reply('Enter the Lido CSM Id you want to load.\nExample: 123');

    const operatorId = await _waitForLidoOperatorId(conversation, ctx);

    if (operatorId == undefined) {
      return;
    }

    const operatorIdStr = operatorId.toString();

    if (currentLidoOperatorId && currentLidoOperatorId !== operatorIdStr) {
      await ctx.reply(
        `Sorry, you can only load one Lido CSM Id. Your current operator id is: ${currentLidoOperatorId}.`,
      );
      return;
    }

    const tmpReply = await ctx.reply(
      `🔄 Loading validators for Lido CSM Id: ${operatorIdStr}. This may take a while...`,
    );

    try {
      const pubkeys = await getOperatorActivePubkeys(operatorId);

      if (pubkeys.length === 0) {
        await editMessageText(
          tmpReply.chat.id,
          tmpReply.message_id,
          `The specified Lido CSM (${operatorIdStr}) has no active validators.`,
        );
        return;
      }

      const result = await addLidoOperatorValidators(loginId, {
        operatorId,
        pubkeys,
      });

      const { newValidatorsConnected } = result;

      const message =
        `✅ Finished loading validators for Lido CSM Id: ${operatorIdStr}.\n` +
        `New validators associated to your account: ${newValidatorsConnected}.\n` +
        `Your validator stats will be sent shortly.`;

      // if (userMissingPubKeys && userMissingPubKeys.length > 0) {
      //   message +=
      //     `\n\nNote: ${userMissingPubKeys.length} validators are not yet indexed in the database.` +
      //     ` They will appear once our indexer catches up.`;
      // }

      await editMessageText(tmpReply.chat.id, tmpReply.message_id, message);
    } catch (error) {
      await editMessageText(
        tmpReply.chat.id,
        tmpReply.message_id,
        `❌ Failed to load validators for Lido CSM Id: ${operatorIdStr}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  } catch (error) {
    await handleError(error, ctx.message?.chat.id);
  }
}
