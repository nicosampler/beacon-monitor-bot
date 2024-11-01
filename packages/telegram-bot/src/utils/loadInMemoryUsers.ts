import { inMemoryUsers } from "@/src/utils/inMemoryDB.js";
import { getAllUsers_db } from "@/src/prisma/users.js";

export async function loadInMemoryUsers() {
  const users = await getAllUsers_db();
  users.forEach((user) => {
    inMemoryUsers[Number(user.id)] = {
      id: Number(user.id),
      chatId: Number(user.chatId),
      messageId: Number(user.messageId) || undefined,
    };
  });
}
