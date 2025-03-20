import { getDataFromContext } from '../utils/getUserIdFromCtx.js';

import { getPrisma } from '@/src/config/prisma.js';
import { MyContext } from '@/src/config/session.js';
import { getWithdrawalAddresses_db } from '@/src/prisma/withdrawalAddresses.js';
import { updateUsersStatsImp } from '@/src/scheduler/tasks/updateUsersStats.js';
import { sendMessage } from '@/src/telegram/utils/messaging.js';
import { handleError } from '@/src/utils/errors/handleError.js';

const prisma = getPrisma();

export async function dashboard(ctx: MyContext) {
  try {
    const { userId } = await getDataFromContext(ctx);

    const wa = await getWithdrawalAddresses_db(userId);
    if (!wa.length) {
      await sendMessage(
        userId,
        `You haven't added any withdrawal address yet. Please add one first.
      
You can add one in: /menu > Validators management > Add withdrawal address.`,
      );
      return;
    }

    // Force a new TG message
    await prisma.user.update({
      where: { id: userId },
      data: { messageId: null },
    });

    await updateUsersStatsImp(userId);
  } catch (error) {
    handleError(error, ctx.chat?.id);
  }
}
