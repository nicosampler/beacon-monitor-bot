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
      },
    });

    if (!nextEpoch) {
      return null;
    }

    // Get the min fromEpoch and max toEpoch from the SyncCommittee table using a single Prisma query
    const syncCommitteeRange = await prisma.syncCommittee.aggregate({
      _min: { fromEpoch: true },
      _max: { toEpoch: true },
    });

    const syncCommitteeInfo = {
      minFromEpoch: syncCommitteeRange._min.fromEpoch,
      maxToEpoch: syncCommitteeRange._max.toEpoch,
    };

    // Determine sync committee status
    // An epoch has sync committees fetched if it's within the range of epochs that have sync committees
    // (minFromEpoch <= epoch <= maxToEpoch)
    let syncCommitteesFetched = false;

    if (syncCommitteeInfo.minFromEpoch !== null && syncCommitteeInfo.maxToEpoch !== null) {
      syncCommitteesFetched =
        nextEpoch.epoch >= syncCommitteeInfo.minFromEpoch &&
        nextEpoch.epoch <= syncCommitteeInfo.maxToEpoch;
    }

    return {
      ...nextEpoch,
      syncCommitteesFetched,
    };
  } catch (error) {
    console.error('Error getting min epoch to process:', error);
    throw error;
  }
});
