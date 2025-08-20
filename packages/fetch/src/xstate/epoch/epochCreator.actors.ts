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
    const MAX_EPOCHS_IN_ADVANCE = 5;

    try {
      // Get all unprocessed epochs ordered by epoch
      const unprocessedEpochs = await prisma.epoch.findMany({
        where: {
          OR: [
            { validatorsInfoFetched: false },
            { rewardsFetched: false },
            { committeesFetched: false },
            { slotsFetched: false },
          ],
        },

        orderBy: { epoch: 'asc' },
        select: { epoch: true },
      });

      if (unprocessedEpochs.length === 0) {
        // If no unprocessed epochs found, use the lookback epoch as starting point
        const lookbackEpoch = getEpochFromSlot(getOldestLookbackSlot());
        const lastEpoch = input.lastEpoch;
        const startEpoch = lastEpoch ? lastEpoch + 1 : lookbackEpoch;

        // Create MAX_EPOCHS_IN_ADVANCE epochs from the start
        const epochsToCreate = [];
        for (let i = 0; i < MAX_EPOCHS_IN_ADVANCE; i++) {
          epochsToCreate.push(startEpoch + i);
        }
        return epochsToCreate;
      }

      const firstUnprocessedEpoch = unprocessedEpochs[0].epoch;
      const lastUnprocessedEpoch = unprocessedEpochs[unprocessedEpochs.length - 1].epoch;

      // Count how many epochs exist from the first unprocessed epoch onwards
      const existingEpochsCount = lastUnprocessedEpoch - firstUnprocessedEpoch + 1;

      // Calculate how many epochs we need to create to have exactly 10 in advance
      const epochsToCreate = [];
      const epochsNeeded = MAX_EPOCHS_IN_ADVANCE - existingEpochsCount;

      if (epochsNeeded > 0) {
        // Create the missing epochs starting from the next epoch after the last unprocessed
        const nextEpochToCreate = lastUnprocessedEpoch + 1;

        // Create the missing epochs
        for (let i = 0; i < epochsNeeded; i++) {
          epochsToCreate.push(nextEpochToCreate + i);
        }
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
