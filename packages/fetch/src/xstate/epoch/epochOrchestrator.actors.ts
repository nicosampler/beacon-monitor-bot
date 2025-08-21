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

      // Get the min fromEpoch and max toEpoch from the SyncCommittee table using a single Prisma query
      const syncCommitteeRange = await prisma.syncCommittee.aggregate({
        _min: { fromEpoch: true },
        _max: { toEpoch: true },
      });

      const syncCommitteeInfo = {
        minFromEpoch: syncCommitteeRange._min.fromEpoch,
        maxToEpoch: syncCommitteeRange._max.toEpoch,
      };

      // Map epochs and determine sync committee status
      // An epoch has sync committees fetched if it's within the range of epochs that have sync committees
      // (minFromEpoch <= epoch <= maxToEpoch)
      const epochsWithSyncCommitteeStatus = nextEpochs.map((epoch: (typeof nextEpochs)[0]) => {
        let syncCommitteesFetched = false;

        if (syncCommitteeInfo.minFromEpoch !== null && syncCommitteeInfo.maxToEpoch !== null) {
          syncCommitteesFetched =
            epoch.epoch >= syncCommitteeInfo.minFromEpoch &&
            epoch.epoch <= syncCommitteeInfo.maxToEpoch;
        }

        return {
          ...epoch,
          syncCommitteesFetched,
        };
      });

      return epochsWithSyncCommitteeStatus;
    } catch (error) {
      console.error('Error getting epochs to process:', error);
      throw error;
    }
  },
);
