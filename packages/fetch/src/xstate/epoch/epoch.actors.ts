import { fromPromise } from 'xstate';

import { VALIDATOR_STATUS } from '@/src/consensus/constants.js';
import { beacon_getValidators } from '@/src/consensus/endpoints.js';
import { fetchAttestationsRewards as _fetchAttestationsRewards } from '@/src/consensus/feed/fetchAttestationsRewards.js';
import { fetchCommittee } from '@/src/consensus/feed/fetchCommittee.js';
import { fetchSyncCommittees as _fetchSyncCommittees } from '@/src/consensus/feed/fetchSyncCommittee.js';
import { saveValidatorsToDatabase as _saveValidatorsToDatabase } from '@/src/consensus/feed/fetchValidators.js';
import { fetchValidatorsBalances as _fetchValidatorsBalances } from '@/src/consensus/feed/fetchValidatorsBalances.js';
import { getEpochFromSlot, getOldestLookbackSlot } from '@/src/consensus/utils/misc.js';
import { getPrisma } from '@/src/lib/prisma.js';

const prisma = getPrisma();

export const getLastCreatedEpoch = fromPromise(async () => {
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

export const getEpochsToCreate = fromPromise(
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

export interface EpochToProcess {
  epoch: number;
  validatorsBalancesFetched: boolean;
  rewardsFetched: boolean;
  committeesFetched: boolean;
  slotsFetched: boolean;
  syncCommitteesFetched: boolean;
  validatorsActivationFetched: boolean;
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
          { validatorsActivationFetched: false },
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
        validatorsActivationFetched: true,
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
export const fetchCommittees = fromPromise(async ({ input }: { input: { epoch: number } }) =>
  fetchCommittee(input.epoch),
);

/**
 * Actor to fetch sync committees for an epoch
 */
export const fetchSyncCommittees = fromPromise(async ({ input }: { input: { epoch: number } }) =>
  _fetchSyncCommittees(input.epoch),
);

/**
 * Actor to check if sync committee for a specific epoch is already fetched
 */
export const checkSyncCommitteeForEpochInDB = fromPromise(
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
 * Unified actor to track transitioning validators
 * Fetches pending validators from DB, gets their data from beacon chain, and saves to DB
 */
export const trackingTransitioningValidators = fromPromise(async () => {
  const pendingValidators = await prisma.validator.findMany({
    where: {
      status: {
        in: [VALIDATOR_STATUS.pending_initialized, VALIDATOR_STATUS.pending_queued],
      },
    },
    select: { id: true },
  });

  if (pendingValidators.length === 0) {
    return { success: true, processedCount: 0 };
  }

  const validatorIds = pendingValidators.map((v) => String(v.id));
  const validatorsData = await beacon_getValidators('head', validatorIds, null);

  await _saveValidatorsToDatabase(validatorsData);

  return { success: true, processedCount: validatorsData.length };
});
