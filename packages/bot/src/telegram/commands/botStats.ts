import { CommandContext, Context } from 'grammy';

import { env } from '@/src/env.js';
import { countUsers_db } from '@/src/prisma/users.js';
import { countAllValidatorsLoaded } from '@/src/prisma/validatros.js';
import { getDataFromContext } from '@/src/telegram/utils/getUserIdFromCtx.js';
import { sendMessage } from '@/src/telegram/utils/messaging.js';
import { AppError } from '@/src/utils/errors/AppError.js';
import { handleError } from '@/src/utils/errors/handleError.js';

export async function botStats(ctx: CommandContext<Context>) {
  try {
    const { userId } = getDataFromContext(ctx);

    if (!env.TG_ADMIN_USER_IDS.includes(userId)) {
      throw new AppError('You are not allowed to use this command', 'UNAUTHORIZED');
    }

    const users = await countUsers_db();
    const validators = await countAllValidatorsLoaded();
    // get all withdrawal addresses
    const allValidators = [];
    //  (
    //   await Promise.all(
    //     (await getWithdrawalAddresses_db()).map((a) =>
    //       getValidatorsByWithdrawalAddresses(a.address)
    //     )
    //   )
    // ).flat();

    await sendMessage(
      ctx.chat.id,
      `
        🤖 Bot Stats:
        - Users: ${users}
        - Loaded Validators: ${validators}
        - Limited validators: ${allValidators.length}
      `,
    );
  } catch (error) {
    await handleError(error, ctx.chat?.id);
  }
}
