import { getDataFromContext } from "../utils/getUserIdFromCtx.js";
import { inMemoryUsers } from "@/src/utils/inMemoryDB.js";
import { updateUsersStatsImp } from "@/src/scheduler/tasks/updateUsersStats.js";
import { handleError } from "@/src/utils/errors/handleError.js";
import { MyContext } from "@/src/config/session.js";
import { getWithdrawalAddresses_db } from "@/src/prisma/withdrawalAddresses.js";
import { sendMessage } from "@/src/telegram/utils/messaging.js";

export async function dashboard(ctx: MyContext) {
  try {
    const { userId } = await getDataFromContext(ctx);

    const user = inMemoryUsers[userId];

    const wa = await getWithdrawalAddresses_db(userId);
    if (!wa.length) {
      await sendMessage(
        userId,
        `You haven't added any withdrawal address yet. Please add one first.
      
You can add one in: /menu > Validators management > Add withdrawal address.`
      );
      return;
    }

    // Force a new TG message
    user.messageId = undefined;

    await updateUsersStatsImp(userId);
  } catch (error) {
    handleError(error, ctx.chat?.id);
  }
}
