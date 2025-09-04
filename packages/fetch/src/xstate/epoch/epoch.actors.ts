import { fromPromise } from 'xstate';

import { fetchAttestationsRewards as _fetchAttestationsRewards } from '@/src/beacon/feed/fetchAttestationsRewards.js';
import { fetchCommittee } from '@/src/beacon/feed/fetchCommittee.js';
import { fetchSyncCommittees as _fetchSyncCommittees } from '@/src/beacon/feed/fetchSyncCommittee.js';
import { fetchValidators as fetchValidatorsFromBeacon } from '@/src/beacon/feed/fetchValidators.js';
import { fetchValidatorsBalances as _fetchValidatorsBalances } from '@/src/beacon/feed/fetchValidatorsBalances.js';
import { getEpochFromSlot, getEpochSlots, getOldestLookbackSlot } from '@/src/beacon/utils/misc.js';
import { getSlotNumberFromTimestamp } from '@/src/beacon/utils/time.js';
import createLogger from '@/src/lib/pino.js';
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
            { validatorsBalancesFetched: false },
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
        validatorsBalancesFetched: false,
        rewardsFetched: false,
        committeesFetched: false,
        slotsFetched: false,
        syncCommitteesFetched: false,
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

/**
 * Finds the next epoch that needs processing
 * Returns the epoch number and slot range, or null if no epoch needs processing
 */
export const pickNextEpoch = fromPromise(async () => {
  try {
    // Find the earliest epoch where any of the completion flags is false
    const nextEpoch = await prisma.epoch.findFirst({
      where: {
        OR: [
          { validatorsBalancesFetched: false },
          { rewardsFetched: false },
          { committeesFetched: false },
          { slotsFetched: false },
          { syncCommitteesFetched: false },
        ],
      },
      orderBy: { epoch: 'asc' },
    });

    if (!nextEpoch) {
      return null;
    }

    const { startSlot, endSlot } = getEpochSlots(nextEpoch.epoch);

    const result = {
      epoch: nextEpoch.epoch,
      startSlot,
      endSlot,
      validatorsBalancesFetched: nextEpoch.validatorsBalancesFetched ?? false,
      rewardsFetched: nextEpoch.rewardsFetched ?? false,
      committeesFetched: nextEpoch.committeesFetched ?? false,
      slotsFetched: nextEpoch.slotsFetched ?? false,
      syncCommitteesFetched: nextEpoch.syncCommitteesFetched ?? false,
    };

    return result;
  } catch (error) {
    console.error('Error picking next epoch:', error);
    throw error;
  }
});

export interface EpochToProcess {
  epoch: number;
  validatorsBalancesFetched: boolean;
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
          { validatorsBalancesFetched: false },
          { rewardsFetched: false },
          { committeesFetched: false },
          { slotsFetched: false },
        ],
      },
      orderBy: { epoch: 'asc' },
      select: {
        epoch: true,
        validatorsBalancesFetched: true,
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

/**
 * Actor to check if we can fetch validators (timing + database conditions)
 */
export const checkIfCanFetchValidatorsBalances = fromPromise(
  async ({ input }: { input: { slot: number } }) => {
    try {
      const startSlot = input.slot;
      const currentSlot = getSlotNumberFromTimestamp(new Date().getTime());

      // First check if the epoch has already started
      return { canProceed: currentSlot >= startSlot };
    } catch (error) {
      console.error('Error checking if can get validators:', error);
      return { canProceed: false };
    }
  },
);

/**
 * Actor to fetch validators for the first slot of an epoch
 */
export const fetchValidators = fromPromise(async ({ input }: { input: { startSlot: number } }) => {
  try {
    const logger = createLogger('fetchValidators', true);
    logger.setContext(`startSlot: ${input.startSlot}`);

    await fetchValidatorsFromBeacon(logger, input.startSlot);

    // Update the epoch to mark validators as fetched
    // const epochNumber = Math.floor(input.startSlot / env.BEACON_SLOTS_PER_EPOCH);
    // await prisma.epoch.update({
    //   where: { epoch: epochNumber },
    //   data: { validatorsInfoFetched: true },
    // });

    logger.info('Validators fetched successfully');
    return { success: true };
  } catch (error) {
    console.error('Error fetching validators:', error);
    throw error;
  }
});

export const fetchValidatorsBalances = fromPromise(
  async ({ input }: { input: { startSlot: number } }) => {
    await _fetchValidatorsBalances(input.startSlot);
  },
);

export const fetchAttestationsRewards = fromPromise(
  async ({ input }: { input: { epoch: number } }) => {
    await _fetchAttestationsRewards(input.epoch);
  },
);

/**
 * Actor to fetch committees for an epoch
 */
export const fetchCommittees = fromPromise(async ({ input }: { input: { epoch: number } }) => {
  try {
    const logger = createLogger('fetchCommittees', true);
    logger.setContext(`epoch: ${input.epoch}`);

    // Fetch committee for the epoch
    await fetchCommittee(logger, input.epoch);

    logger.info('Committees fetched successfully');
  } catch (error) {
    console.error('Error fetching committees:', error);
    throw error;
  }
});

/**
 * Actor to fetch sync committees for an epoch
 */
export const fetchSyncCommittees = fromPromise(async ({ input }: { input: { epoch: number } }) =>
  _fetchSyncCommittees(input.epoch),
);

/**
 * Actor to check if sync committee for a specific epoch is already fetched
 */
export const checkSyncCommitteeStatus = fromPromise(
  async ({ input }: { input: { epoch: number } }) => {
    try {
      // Check if sync committee for this epoch is already fetched
      const syncCommittee = await prisma.syncCommittee.findFirst({
        where: {
          fromEpoch: { lte: input.epoch },
          toEpoch: { gte: input.epoch },
        },
      });

      return { isFetched: !!syncCommittee };
    } catch (error) {
      console.error('Error checking sync committee status:', error);
      throw error;
    }
  },
);

/**
 * Actor to update the epoch's slotsFetched flag to true
 */
export const updateSlotsFetched = fromPromise(async ({ input }: { input: { epoch: number } }) => {
  try {
    await prisma.epoch.update({
      where: { epoch: input.epoch },
      data: { slotsFetched: true },
    });

    return { success: true };
  } catch (error) {
    console.error('Error updating slotsFetched:', error);
    throw error;
  }
});

/**
 * Actor to update the epoch's syncCommitteesFetched flag to true
 */
export const updateSyncCommitteesFetched = fromPromise(
  async ({ input }: { input: { epoch: number } }) => {
    try {
      await prisma.epoch.update({
        where: { epoch: input.epoch },
        data: { syncCommitteesFetched: true },
      });

      return { success: true };
    } catch (error) {
      console.error('Error updating syncCommitteesFetched:', error);
      throw error;
    }
  },
);

/**
 * Actor to check if slots have already been processed for an epoch
 */
export const checkSlotsProcessed = fromPromise(async ({ input }: { input: { epoch: number } }) => {
  try {
    const epoch = await prisma.epoch.findUnique({
      where: { epoch: input.epoch },
      select: { slotsFetched: true },
    });

    return { slotsProcessed: epoch?.slotsFetched ?? false };
  } catch (error) {
    console.error('Error checking slots processed status:', error);
    throw error;
  }
});
