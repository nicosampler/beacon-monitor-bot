import { fromPromise } from 'xstate';

import { beacon_getSyncCommittees } from '@/src/beacon/endpoints.js';
import { fetchCommittee } from '@/src/beacon/feed/fetchCommittee.js';
import { fetchValidators as fetchValidatorsFromBeacon } from '@/src/beacon/feed/fetchValidators.js';
import { fetchValidatorsBalances as fetchValidatorsBalancesFromBeacon } from '@/src/beacon/feed/fetchValidatorsBalances.js';
import { getEpochFromSlot, getEpochSlots, getOldestLookbackSlot } from '@/src/beacon/utils/misc.js';
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
      syncCommitteesFetched: !!existingSyncCommittee,
    };

    return result;
  } catch (error) {
    console.error('Error picking next epoch:', error);
    throw error;
  }
});

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
  if (context.epoch > currentEpoch) {
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
export const checkIfCanGetValidators = fromPromise(
  async ({ input }: { input: ProcessEpochContext }) => {
    try {
      const context = input;
      const currentSlot = getSlotNumberFromTimestamp(new Date().getTime());

      // First check if the epoch has already started
      if (currentSlot <= context.startSlot) {
        return { canProceed: false };
      }

      // Check if we're in the base epoch (the epoch containing BEACON_LOOKBACK_SLOT)
      const baseEpoch = getEpochFromSlot(env.BEACON_LOOKBACK_SLOT);
      if (context.epoch === baseEpoch) {
        // For the base epoch, we don't need to check the previous epoch
        return { canProceed: true };
      }

      // For other epochs, check if the last slot of the previous epoch has blockFetched = true
      const previousEpoch = context.epoch - 1;
      const previousEpochEndSlot = getEpochSlots(previousEpoch).endSlot;

      const previousSlot = await prisma.slot.findUnique({
        where: { slot: previousEpochEndSlot },
        select: { blockFetched: true },
      });

      // If the previous slot doesn't exist or blockFetched is false, we can't proceed
      return { canProceed: previousSlot?.blockFetched === true };
    } catch (error) {
      console.error('Error checking if can get validators:', error);
      return { canProceed: false };
    }
  },
);

/**
 * Guard function to check if validators have not been fetched yet
 */
export const validatorsNotFetched = ({ context }: { context: ProcessEpochContext }): boolean => {
  return !context.validatorsInfoFetched;
};

/**
 * Guard function to check if committees have not been fetched yet
 */
export const committeesNotFetched = ({ context }: { context: ProcessEpochContext }): boolean => {
  return !context.committeesFetched;
};

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
 * Guard function to check if sync committees have not been fetched yet
 * Sync committees are valid for a period of epochs from-to.
 */
export const syncCommitteesNotFetched = ({
  context,
}: {
  context: ProcessEpochContext;
}): boolean => {
  return !context.syncCommitteesFetched;
};

/**
 * Guard function to check if rewards have not been fetched yet
 */
export const rewardsNotFetched = ({ context }: { context: ProcessEpochContext }): boolean => {
  return !context.rewardsFetched;
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
    return { success: true };
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
    await prisma.syncCommittee.create({
      data: {
        fromEpoch: periodStartEpoch,
        toEpoch: periodStartEpoch + env.BEACON_EPOCHS_PER_SYNC_COMMITTEE_PERIOD - 1,
        validators: syncCommitteeData.validators,
        validatorAggregates: syncCommitteeData.validator_aggregates,
      },
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
