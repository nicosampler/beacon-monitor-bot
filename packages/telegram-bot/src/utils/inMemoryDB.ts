export type InMemoryUser = {
  id: number;
  chatId: number;
  messageId?: number;
  withdrawable?: number;
};

export const inMemoryUsers: Record<number, InMemoryUser> = {};

export function resetUser(userId: number) {
  if (!inMemoryUsers[userId]) return;

  inMemoryUsers[userId] = {
    id: userId,
    chatId: inMemoryUsers[userId].chatId,
    messageId: undefined,
  };
}
