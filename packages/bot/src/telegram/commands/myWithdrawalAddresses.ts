import { MyContext } from '@/src/config/session.js';
import { getFeeRewardAddresses_db } from '@/src/prisma/feeRewardAddresses.js';
import { getWithdrawalAddresses_db } from '@/src/prisma/withdrawalAddresses.js';
import { getDataFromContext } from '@/src/telegram/utils/getUserIdFromCtx.js';
import { sendMessage } from '@/src/telegram/utils/messaging.js';
import { handleError } from '@/src/utils/errors/handleError.js';

export async function myAddresses(ctx: MyContext) {
  try {
    const { userId } = await getDataFromContext(ctx);

    const withdrawalAddresses = await getWithdrawalAddresses_db(userId);
    const feeRewardAddresses = await getFeeRewardAddresses_db(userId);

    if (!withdrawalAddresses.length && !feeRewardAddresses.length) {
      return await sendMessage(userId, "You haven't load any addresses yet.");
    }

    await sendMessage(
      userId,
      `Withdrawal addresses:

${
  withdrawalAddresses.length
    ? withdrawalAddresses.map((w) => w.address).join('\n')
    : 'No withdrawal addresses yet.'
}`,
    );

    await sendMessage(
      userId,
      `Fee reward addresses:

${
  feeRewardAddresses.length
    ? feeRewardAddresses.map((w) => w.address).join('\n')
    : 'No fee reward addresses yet.'
}`,
    );
  } catch (error) {
    await handleError(error, ctx.from?.username);
  }
}
