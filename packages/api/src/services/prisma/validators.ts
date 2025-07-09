import { getPrisma } from '@/src/lib/prisma.js';

const prisma = getPrisma();

export const validatorService = {
  /**
   * Find validators by their withdrawal addresses (case insensitive)
   */
  findByWithdrawalAddresses: async (addresses: string[]) => {
    return prisma.validator.findMany({
      where: {
        withdrawalAddress: {
          in: addresses.map((addr) => addr.toLowerCase()),
        },
      },
    });
  },

  /**
   * Find validators by their IDs
   */
  findByIds: async (validatorIds: number[]) => {
    return prisma.validator.findMany({
      where: {
        id: {
          in: validatorIds,
        },
      },
    });
  },
};
