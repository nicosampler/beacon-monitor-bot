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
    try {
      const lastEpoch = input.lastEpoch;
      const lookbackEpoch = getEpochFromSlot(getOldestLookbackSlot());

      // For the base case, start from lookbackEpoch, otherwise from lastEpoch + 1
      const startEpoch = lastEpoch ? lastEpoch + 1 : lookbackEpoch;

      // Calculate 10 epochs forward from the start
      const epochsToCreate = [];
      for (let i = 0; i < 10; i++) {
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
