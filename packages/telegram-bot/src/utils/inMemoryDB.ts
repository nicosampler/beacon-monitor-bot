export type InMemoryUser = {
  id: number;
  chatId: number;
  messageId?: number;
  withdrawable?: number;
  priorityFeeRewards?: any;
  performance?: any;
  last100AttestedPercentage?: number;
  validatorsWithMissedAttestations?: { id: number; amount: number }[];
  status?: any;
};

export const inMemoryUsers: Record<number, InMemoryUser> = {};

export function resetUser(userId: number) {
  if (!inMemoryUsers[userId]) return;

  const chatId = inMemoryUsers[userId].chatId;

  inMemoryUsers[userId] = {
    id: userId,
    chatId,
    messageId: undefined,
  };
}
