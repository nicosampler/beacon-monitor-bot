import { fromPromise } from 'xstate';

import { getOldestLookbackSlot, getEpochFromSlot } from '@/src/beacon/utils/misc.js';
import { getPrisma } from '@/src/lib/prisma.js';

const prisma = getPrisma();

export const getLastCreatedEpochOrNull = fromPromise(async () => {
  try {
    const lastEpoch = await prisma.epoch.findFirst({
      orderBy: { epoch: 'desc' },
      select: { epoch: true },
    });
    return lastEpoch?.epoch ?? null;
  } catch (error) {
    console.error('Error fetching last created epoch:', error);
    throw error;
  }
});

export const computeNextEpochBatch = fromPromise(
  async ({ input }: { input: { lastEpoch: number | null } }) => {
    const MAX_UNPROCESSED_EPOCHS = 5;

    try {
      // Get count of unprocessed epochs
      const unprocessedCount = await prisma.epoch.count({
        where: {
          OR: [
            { rewardsFetched: false },
            { committeesFetched: false },
            { slotsFetched: false },
            { syncCommitteesFetched: false },
          ],
        },
      });

      // If we already have 5 or more unprocessed epochs, don't create new ones
      if (unprocessedCount >= MAX_UNPROCESSED_EPOCHS) {
        return [];
      }

      // Calculate how many epochs we need to create
      const epochsNeeded = MAX_UNPROCESSED_EPOCHS - unprocessedCount;

      // Get the starting epoch for creation
      const lookbackEpoch = getEpochFromSlot(getOldestLookbackSlot());
      const lastEpoch = input.lastEpoch;
      const startEpoch = lastEpoch ? lastEpoch + 1 : lookbackEpoch;

      // Create array of epochs to create
      const epochsToCreate = [];
      for (let i = 0; i < epochsNeeded; i++) {
        epochsToCreate.push(startEpoch + i);
      }

      return epochsToCreate;
    } catch (error) {
      console.error('Error computing next epoch batch:', error);
      throw error;
    }
  },
);

export const enqueueEpochs = fromPromise(
  async ({ input }: { input: { epochsToCreate: number[] } }) => {
    try {
      const epochsToCreate = input.epochsToCreate;

      const epochsData = epochsToCreate.map((epoch: number) => ({
        epoch: epoch,
        validatorsInfoFetched: false,
        validatorsBalancesFetched: false,
        rewardsFetched: false,
        committeesFetched: false,
      }));

      await prisma.epoch.createMany({
        data: epochsData,
        skipDuplicates: true,
      });

      return { count: epochsToCreate.length };
    } catch (error) {
      console.error('Error enqueuing epochs:', error);
      throw error;
    }
  },
);
