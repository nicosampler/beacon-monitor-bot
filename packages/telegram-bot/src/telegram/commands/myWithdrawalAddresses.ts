import { getDataFromContext } from "@/src/telegram/utils/getUserIdFromCtx.js";
import { getWithdrawalAddresses_db } from "@/src/prisma/withdrawalAddresses.js";
import { sendMessage } from "@/src/telegram/utils/messaging.js";
import { handleError } from "@/src/utils/errors/handleError.js";
import { MyContext } from "@/src/config/session.js";

export async function myWithdrawalAddresses(ctx: MyContext) {
  try {
    const { userId } = await getDataFromContext(ctx);

    const withdrawalAddresses = await getWithdrawalAddresses_db(userId);

    await sendMessage(
      userId,
      `Your withdrawal addresses are:

${withdrawalAddresses.map((w) => w.address).join("\n")}`
    );
  } catch (error) {
    handleError(error, ctx.from?.username);
  }
}
