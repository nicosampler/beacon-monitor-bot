import { Conversation } from '@grammyjs/conversations';

import { removeLidoOperatorValidators } from '@/src/api/user.js';
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
  validators: { id: number }[];
};

type RemoveValidatorsByLidoOperatorConversation = Conversation<MyContext>;

export async function removeValidatorsByLidoOperator(
  _conversation: RemoveValidatorsByLidoOperatorConversation,
  ctx: MyContext,
) {
  try {
    const { userId } = await getDataFromContext(ctx);

    const user = (await prisma.user.findUnique({
      where: { userId },
      include: { validators: true },
    })) as UserWithRelations | null;

    if (!user) {
      await ctx.reply('User not found');
      return;
    }

    const loginId = user.loginId;
    const currentLidoOperatorId = user.lidoOperatorId;

    if (!currentLidoOperatorId) {
      await ctx.reply('You do not have a Lido operator id configured yet.');
      return;
    }

    const operatorId = Number(currentLidoOperatorId);

    if (!Number.isSafeInteger(operatorId) || operatorId < 0) {
      await ctx.reply(
        `Your configured Lido operator id (${currentLidoOperatorId}) is invalid. Please contact support.`,
      );
      return;
    }

    const tmpReply = await ctx.reply(
      `🔄 Removing validators associated with Lido operator id: ${currentLidoOperatorId}. This may take a while...`,
    );

    try {
      const pubkeys = await getOperatorActivePubkeys(operatorId);

      if (pubkeys.length === 0) {
        await editMessageText(
          tmpReply.chat.id,
          tmpReply.message_id,
          `The configured Lido operator (${currentLidoOperatorId}) has no active validators. Nothing to remove.`,
        );
        return;
      }

      const result = await removeLidoOperatorValidators(loginId, {
        pubkeys,
      });

      const { validatorsDisconnected } = result;

      const message =
        `✅ Finished removing validators for Lido operator id:${currentLidoOperatorId}.\n` +
        `Validators disconnected from your account: ${validatorsDisconnected}`;

      //   if (userMissingPubKeys && userMissingPubKeys.length > 0) {
      //     message +=
      //       `\n\nNote: ${userMissingPubKeys.length} validators from the operator were not found in the database.` +
      //       ` They might not be indexed yet or were never associated with your account.`;
      //   }

      await editMessageText(tmpReply.chat.id, tmpReply.message_id, message);
    } catch (error) {
      await editMessageText(
        tmpReply.chat.id,
        tmpReply.message_id,
        `❌ Failed to remove validators for Lido operator id: ${currentLidoOperatorId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  } catch (error) {
    await handleError(error, ctx.message?.chat.id);
  }
}
