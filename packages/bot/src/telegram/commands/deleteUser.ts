import {
  deleteUser_db as _deleteUser,
  getUser_db,
} from "@/src/prisma/users.js";
import { getDataFromContext } from "../utils/getUserIdFromCtx.js";
import { sendMessage } from "@/src/telegram/utils/messaging.js";
import { handleError } from "@/src/utils/errors/handleError.js";
import { MyContext } from "@/src/config/session.js";
import { getPrisma } from "@/src/config/prisma.js";

const prisma = getPrisma();

export async function deleteUser(ctx: MyContext) {
  try {
    // recover userId
    const { userId } = await getDataFromContext(ctx);
    if (!userId) return false;

    // delete user from db
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      sendMessage(userId, "User not found.");
      return false;
    }

    await _deleteUser(userId);

    // notify user
    sendMessage(
      userId,
      "😢 User deleted. We'll miss you! Hope to see you again soon! 👋"
    );
  } catch (error) {
    console.error(error);
    handleError(error, ctx.from?.id);
  }
}
