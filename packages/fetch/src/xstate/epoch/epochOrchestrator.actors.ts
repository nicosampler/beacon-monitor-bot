import { fromPromise } from 'xstate';

import { getPrisma } from '@/src/lib/prisma.js';

const prisma = getPrisma();

export interface EpochToProcess {
  epoch: number;
  validatorsInfoFetched: boolean;
  rewardsFetched: boolean;
  committeesFetched: boolean;
  slotsFetched: boolean;
}

/**
 * Finds multiple epochs that need processing
 * Returns epochs with their current state
 */
export const getEpochsToProcess = fromPromise(
  async ({ input }: { input: { limit: number } }): Promise<EpochToProcess[]> => {
    try {
      // Find multiple epochs where any of the completion flags is false
      const nextEpochs = await prisma.epoch.findMany({
        where: {
          OR: [
            { validatorsInfoFetched: false },
            { rewardsFetched: false },
            { committeesFetched: false },
            { slotsFetched: false },
          ],
        },
        orderBy: { epoch: 'asc' },
        take: input.limit,
        select: {
          epoch: true,
          validatorsInfoFetched: true,
          rewardsFetched: true,
          committeesFetched: true,
          slotsFetched: true,
        },
      });

      return nextEpochs;
    } catch (error) {
      console.error('Error getting epochs to process:', error);
      throw error;
    }
  },
);
