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

  /**
   * Find validators by their pubkeys (case insensitive, batched).
   */
  findByPubkeys: async (pubkeys: string[]) => {
    if (pubkeys.length === 0) {
      return [];
    }

    // Normalize pubkeys once to lowercase.
    const normalized = pubkeys.map((pk) => pk.toLowerCase());

    const batchSize = 100;
    const results: Awaited<ReturnType<(typeof prisma)['validator']['findMany']>> = [];

    for (let i = 0; i < normalized.length; i += batchSize) {
      const batch = normalized.slice(i, i + batchSize);

      const batchResult = await prisma.validator.findMany({
        where: {
          OR: batch.map((pk) => ({
            pubkey: {
              equals: pk,
              mode: 'insensitive',
            },
          })),
        },
      });

      results.push(...batchResult);
    }

    return results;
  },
};
