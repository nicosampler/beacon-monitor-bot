import { fromPromise } from 'xstate';

import { beacon_getSyncCommittees } from '@/src/beacon/endpoints.js';
import { fetchCommittee } from '@/src/beacon/feed/fetchCommittee.js';
import { fetchValidators as fetchValidatorsFromBeacon } from '@/src/beacon/feed/fetchValidators.js';
import { getEpochFromSlot, getEpochSlots } from '@/src/beacon/utils/misc.js';
import {
  getEpochNumberFromTimestamp,
  getSlotNumberFromTimestamp,
} from '@/src/beacon/utils/time.js';
import { getSyncCommitteePeriodStartEpoch } from '@/src/beacon/utils/time.js';
import { env } from '@/src/env.js';
import createLogger from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';
import {
  PickNextEpochOutput,
  PickNextEpochResult,
  ProcessEpochContext,
} from '@/src/xstate/epoch/epochProcessor.types.js';

const prisma = getPrisma();

/**
 * Finds the next epoch that needs processing
 * Returns the epoch number and slot range, or null if no epoch needs processing
 */
export const pickNextEpoch = fromPromise(async (): Promise<PickNextEpochResult> => {
  try {
    // Find the earliest epoch where any of the completion flags is false
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
      return null; // No epoch needs processing
    }

    const { startSlot, endSlot } = getEpochSlots(nextEpoch.epoch);

    // Check if sync committees have been fetched for this epoch
    const existingSyncCommittee = await prisma.syncCommittee.findFirst({
      where: {
        fromEpoch: { lte: nextEpoch.epoch },
        toEpoch: { gte: nextEpoch.epoch },
      },
    });

    const result: PickNextEpochOutput = {
      epoch: nextEpoch.epoch,
      startSlot,
      endSlot,
      validatorsInfoFetched: nextEpoch.validatorsInfoFetched ?? false,
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

/**
 * Guard function to check if the epoch is the first epoch of a sync committee period
 */
export const isFirstEpochOfSyncCommitteePeriod = ({
  context,
}: {
  context: ProcessEpochContext;
}): boolean => {
  return context.epoch === getSyncCommitteePeriodStartEpoch(context.epoch);
};

/**
 * Guard function to check if the epoch is the lookback epoch (derived from BEACON_LOOKBACK_SLOT)
 */
export const isLookbackEpoch = ({ context }: { context: ProcessEpochContext }): boolean => {
  const lookbackEpoch = getEpochFromSlot(env.BEACON_LOOKBACK_SLOT);
  return context.epoch === lookbackEpoch;
};

/**
 * Guard function to check if we have a next epoch to process
 */
export const hasNextEpoch = ({ event }: { event: any }): boolean => {
  return event.output !== null;
};

/**
 * Guard function to check if we can start processing an epoch
 * Based on the logic from fetchEpochInfo.ts
 */
export const canProcessEpoch = ({ context }: { context: ProcessEpochContext }): boolean => {
  const currentEpoch = getEpochNumberFromTimestamp(new Date().getTime());

  // We need to wait for the epoch to start
  if (context.epoch > currentEpoch + 1) {
    return false;
  }

  return true;
};

/**
 * Guard function to check if the epoch has already started (timing condition only)
 * We need to wait for the current slot to be greater than the first slot of the epoch
 */
export const hasEpochAlreadyStarted = ({ context }: { context: ProcessEpochContext }): boolean => {
  const currentSlot = getSlotNumberFromTimestamp(new Date().getTime());

  // We need to wait for the current slot to be greater than the first slot of the epoch
  return currentSlot > context.startSlot;
};

/**
 * Actor to check if we can fetch validators (timing + database conditions)
 */
export const checkIfCanGetValidators = fromPromise(async ({ input }: { input: number }) => {
  try {
    const startSlot = input;
    const currentSlot = getSlotNumberFromTimestamp(new Date().getTime());

    // First check if the epoch has already started
    return { canProceed: currentSlot >= startSlot };
  } catch (error) {
    console.error('Error checking if can get validators:', error);
    return { canProceed: false };
  }
});

/**
 * Guard function to check if validators have not been fetched yet
 */
// export const validatorsNotFetched = ({ context }: { context: ProcessEpochContext }): boolean => {
//   return !context.validatorsInfoFetched;
// };

/**
 * Guard function to check if we can fetch committees
 * Based on logic from fetchCommittee.ts
 */
export const canFetchCommittees = ({ context }: { context: ProcessEpochContext }): boolean => {
  const currentEpoch = getEpochNumberFromTimestamp(new Date().getTime());

  // We can fetch up to 1 epoch in advance
  if (context.epoch >= currentEpoch + 1) {
    return false;
  }

  return true;
};

/**
 * Guard function to check if rewards have not been fetched yet
 */
export const rewardsNotFetched = ({ context }: { context: ProcessEpochContext }): boolean => {
  return !context.rewardsFetched;
};

/**
 * Guard function to check if rewards can be processed
 * Rewards can only be processed when:
 * 1. Validators have been fetched for the current epoch
 * 2. Current slot is greater than the epoch's end slot
 */
export const canProcessRewards = ({ context }: { context: ProcessEpochContext }): boolean => {
  // First condition: validators must have been fetched for the current epoch
  // if (!context.validatorsInfoFetched) {
  //   return false;
  // }

  // Second condition: current slot must be greater than the epoch's end slot
  const currentSlot = getSlotNumberFromTimestamp(new Date().getTime());
  return currentSlot > context.endSlot;
};

/**
 * Guard function to check if we can fetch sync committees
 * Based on logic from fetchSyncCommittees.ts
 */
export const canFetchSyncCommittees = ({ context }: { context: ProcessEpochContext }): boolean => {
  const currentEpoch = getEpochNumberFromTimestamp(new Date().getTime());

  // We can fetch up to 1 epoch in advance
  if (context.epoch > currentEpoch + 1) {
    return false;
  }

  return true;
};

/**
 * Actor to fetch validators for the first slot of an epoch
 */
export const fetchValidators = fromPromise(async ({ input }: { input: { startSlot: number } }) => {
  try {
    const logger = createLogger('fetchValidators', true);
    logger.addContext(`startSlot: ${input.startSlot}`);

    await fetchValidatorsFromBeacon(logger, input.startSlot);

    // Update the epoch to mark validators as fetched
    const epochNumber = Math.floor(input.startSlot / env.BEACON_SLOTS_PER_EPOCH);
    await prisma.epoch.update({
      where: { epoch: epochNumber },
      data: { validatorsInfoFetched: true },
    });

    logger.info('Validators fetched successfully');
    return { success: true };
  } catch (error) {
    console.error('Error fetching validators:', error);
    throw error;
  }
});

/**
 * Actor to fetch committees for an epoch
 */
export const fetchCommittees = fromPromise(async ({ input }: { input: { epoch: number } }) => {
  try {
    const logger = createLogger('fetchCommittees', true);
    logger.addContext(`epoch: ${input.epoch}`);

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
export const fetchSyncCommittees = fromPromise(async ({ input }: { input: { epoch: number } }) => {
  try {
    const logger = createLogger('fetchSyncCommittees', true);
    logger.addContext(`epoch: ${input.epoch}`);

    // Get the sync committee period start for the epoch
    const periodStartEpoch = getSyncCommitteePeriodStartEpoch(input.epoch);

    // Fetch sync committee data for the period
    const syncCommitteeData = await beacon_getSyncCommittees(periodStartEpoch);

    // Store the sync committee data in the database
    await prisma.syncCommittee.upsert({
      where: {
        fromEpoch_toEpoch: {
          fromEpoch: periodStartEpoch,
          toEpoch: periodStartEpoch + env.BEACON_EPOCHS_PER_SYNC_COMMITTEE_PERIOD - 1,
        },
      },
      create: {
        fromEpoch: periodStartEpoch,
        toEpoch: periodStartEpoch + env.BEACON_EPOCHS_PER_SYNC_COMMITTEE_PERIOD - 1,
        validators: syncCommitteeData.validators,
        validatorAggregates: syncCommitteeData.validator_aggregates,
      },
      update: {},
    });

    // Mark the epoch as having sync committees fetched
    await prisma.epoch.update({
      where: { epoch: input.epoch },
      data: { syncCommitteesFetched: true },
    });

    logger.info(
      `Sync committees fetched successfully for period ${periodStartEpoch} to ${periodStartEpoch + env.BEACON_EPOCHS_PER_SYNC_COMMITTEE_PERIOD - 1}`,
    );
    return { success: true };
  } catch (error) {
    console.error('Error fetching sync committees:', error);
    throw error;
  }
});

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
