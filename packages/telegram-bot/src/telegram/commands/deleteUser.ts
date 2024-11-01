import { deleteUser_db as _deleteUser } from "@/src/prisma/users.js";
import { getDataFromContext } from "../utils/getUserIdFromCtx.js";
import { inMemoryUsers } from "@/src/utils/inMemoryDB.js";
import { sendMessage } from "@/src/telegram/utils/messaging.js";
import { handleError } from "@/src/utils/errors/handleError.js";
import { MyContext } from "@/src/config/session.js";

export async function deleteUser(ctx: MyContext) {
  try {
    // recover userId
    const { userId } = await getDataFromContext(ctx);
    if (!userId) return false;

    // delete user from db
    await _deleteUser(userId);

    // delete user from inMemoryDB
    delete inMemoryUsers[userId];

    // notify user
    sendMessage(
      userId,
      "😢 User deleted. We'll miss you! Hope to see you again soon! 👋"
    );
  } catch (error) {
    handleError(error, ctx.from?.id);
  }
}
