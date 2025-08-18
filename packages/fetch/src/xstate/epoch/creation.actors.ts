import { getPrisma } from '@/src/lib/prisma.js';
import { getOldestLookbackSlot, getEpochFromSlot } from '@/src/beacon/utils/misc.js';
import { fromPromise } from 'xstate';

const prisma = getPrisma();

export const getLastCreatedEpochOrNull = fromPromise(async () => {
  try {
    const lastEpoch = await prisma.epoch.findFirst({
      orderBy: { epoch: 'desc' },
      select: { epoch: true },
    });
    return lastEpoch?.epoch || 0;
  } catch (error) {
    console.error('Error fetching last created epoch:', error);
    throw error;
  }
});

export const computeNextEpochBatch = fromPromise(
  async ({ input }: { input: { lastEpoch: number } }) => {
    try {
      const lastEpoch = input.lastEpoch || 0;
      const lookbackSlot = getOldestLookbackSlot();
      const baseEpoch = Math.max(lastEpoch, getEpochFromSlot(lookbackSlot));

      // Calculate 10 epochs forward from the base
      const epochsToCreate = [];
      for (let i = 0; i < 10; i++) {
        epochsToCreate.push(baseEpoch + i + 1);
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
