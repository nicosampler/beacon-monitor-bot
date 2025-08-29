import { fromPromise } from 'xstate';

import { getPrisma } from '@/src/lib/prisma.js';

const prisma = getPrisma();

export interface EpochToProcess {
  epoch: number;
  validatorsInfoFetched: boolean;
  rewardsFetched: boolean;
  committeesFetched: boolean;
  slotsFetched: boolean;
  syncCommitteesFetched: boolean;
}

/**
 * Finds the minimum unprocessed epoch that needs processing
 * Returns a single epoch with its current state
 */
export const getMinEpochToProcess = fromPromise(async (): Promise<EpochToProcess | null> => {
  try {
    // Find the minimum epoch where any of the completion flags is false
    const nextEpoch = await prisma.epoch.findFirst({
      where: {
        OR: [
          { validatorsInfoFetched: false },
          { rewardsFetched: false },
          { committeesFetched: false },
          { slotsFetched: false },
        ],
      },
      orderBy: { epoch: 'asc' },
      select: {
        epoch: true,
        validatorsInfoFetched: true,
        rewardsFetched: true,
        committeesFetched: true,
        slotsFetched: true,
        syncCommitteesFetched: true,
      },
    });

    if (!nextEpoch) {
      return null;
    }

    return {
      ...nextEpoch,
    };
  } catch (error) {
    console.error('Error getting min epoch to process:', error);
    throw error;
  }
});
