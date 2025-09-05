import { fromPromise } from 'xstate';

import { beacon_blocks } from '@/src/beacon/endpoints.js';
import { fetchBlockAndSyncRewards as _fetchBlockAndSyncRewards } from '@/src/beacon/feed/fetchBlockAndSyncRewards.js';
import { processAttestations as _processAttestations } from '@/src/beacon/feed/processAttestations.js';
import { Attestation, Block } from '@/src/beacon/types.js';
import { getSlotNumberFromTimestamp } from '@/src/beacon/utils/time.js';
import { env } from '@/src/env.js';
import { getBlock } from '@/src/execution/endpoints.js';
import { getPrisma } from '@/src/lib/prisma.js';
import {
  db_getSyncCommitteeValidators,
  db_getSlotCommitteesValidatorsAmountsForSlots,
} from '@/src/utils/db.js';
const prisma = getPrisma();

export interface ProcessSlotInput {
  slot: number;
  epoch: number;
  beaconBlockData?: BeaconBlockData;
}

export interface CheckSlotProcessedInput {
  slot: number;
}

export interface CheckSyncCommitteeOutput {
  syncCommitteeExists: boolean;
}

export interface BeaconBlockData {
  slot: number;
  epoch: number;
  blockHash: string;
  proposerIndex: number;
  // Add more fields as needed
}

export interface ELRewardsData {
  slot: number;
  executionRewards: number;
  // Add more fields as needed
}

export interface BlockAndSyncRewardsData {
  slot: number;
  blockRewards: number;
  syncRewards: number;
  // Add more fields as needed
}

export interface AttestationsData {
  slot: number;
  attestations: Array<{
    validatorIndex: number;
    committeeIndex: number;
    // Add more fields as needed
  }>;
}

export interface SyncCommitteeAttestationsData {
  slot: number;
  syncCommitteeAttestations: Array<{
    validatorIndex: number;
    // Add more fields as needed
  }>;
}

export interface ValidatorStatusesData {
  slot: number;
  validatorUpdates: Array<{
    validatorIndex: number;
    status: string;
    // Add more fields as needed
  }>;
}

export interface WithdrawalsData {
  slot: number;
  withdrawals: Array<{
    validatorIndex: number;
    amount: number;
    // Add more fields as needed
  }>;
}

export interface CheckSlotReadyInput {
  slot: number;
}

export interface CheckSlotReadyOutput {
  isReady: boolean;
  currentSlot: number;
  maxSlotToFetch: number;
}

/**
 * @fileoverview Actors for the slot processor machine
 *
 * These are placeholder actors with dummy logic as requested.
 * They will be implemented with real functionality later.
 */

/**
 * Actor to check if a slot is already processed
 */
export const getSlot = fromPromise(async ({ input }: { input: CheckSlotProcessedInput }) => {
  const slot = await prisma.slot.findFirst({
    where: {
      slot: input.slot,
    },
  });

  if (!slot) {
    // Return null instead of throwing an error
    // This allows the state machine to handle the case gracefully
    return null;
  }

  return slot;
});

/**
 * Actor to check if a slot is ready to be processed
 * based on BEACON_DELAY_SLOTS_TO_HEAD
 */
export const checkSlotReady = fromPromise(async ({ input }: { input: CheckSlotReadyInput }) => {
  const currentSlot = getSlotNumberFromTimestamp(Date.now());
  const maxSlotToFetch = currentSlot - env.BEACON_DELAY_SLOTS_TO_HEAD;
  return { isReady: input.slot <= maxSlotToFetch };
});

/**
 * Actor to fetch beacon block data
 */
export const fetchBeaconBlock = fromPromise(async ({ input }: { input: { slot: number } }) =>
  beacon_blocks(input.slot),
);

export const fetchELRewards = fromPromise(
  async ({ input }: { input: { slot: number; block: number; timestamp: number } }) => {
    const blockInfo = await getBlock(input.block);
    if (!blockInfo) {
      throw new Error(`Block ${input.block} not found`);
    }

    prisma.$transaction(async (tx) => {
      await tx.executionRewards.create({
        data: blockInfo,
      });

      await tx.slot.update({
        where: {
          slot: input.slot,
        },
        data: {
          executionRewardsProcessed: true,
        },
      });
    });
  },
);

/**
 * Actor to check if sync committee data exists for a given epoch
 */
export const checkSyncCommittee = fromPromise(
  async ({
    input,
  }: {
    input: {
      epoch: number;
    };
  }) => {
    const syncCommittee = await db_getSyncCommitteeValidators(input.epoch);
    return {
      syncCommittee,
    };
  },
);

/**
 * Actor to fetch block and sync rewards
 */
export const fetchBlockAndSyncRewards = fromPromise(
  async ({
    input,
  }: {
    input: { slot: number; timestamp: number; syncCommitteeValidators: string[] };
  }) => {
    const { slot, timestamp, syncCommitteeValidators } = input;
    return _fetchBlockAndSyncRewards(slot, timestamp, syncCommitteeValidators);
  },
);

/**
 * Actor to process attestations
 */
export const processAttestations = fromPromise(
  async ({
    input,
  }: {
    input: {
      slotNumber: number;
      attestations: Attestation[];
      slotCommitteesValidatorsAmounts: Record<number, number[]>;
    };
  }) => {
    _processAttestations(
      input.slotNumber,
      input.attestations,
      input.slotCommitteesValidatorsAmounts,
    );
  },
);

/**
 * Actor to cleanup old committee data
 */
export const cleanupOldCommittees = fromPromise(async ({ input }: { input: { slot: number } }) => {
  await prisma.committee.deleteMany({
    where: {
      slot: {
        lt: input.slot - env.BEACON_SLOTS_PER_EPOCH * 3, // some buffer just in case
      },
      attestationDelay: {
        lte: env.BEACON_MAX_ATTESTATION_DELAY,
      },
    },
  });

  return {
    slot: input.slot,
    cleanupCompleted: true,
  };
});

/**
 * Actor to process sync committee attestations
 */
export const processSyncCommitteeAttestations = fromPromise(
  async ({ input }: { input: ProcessSlotInput }): Promise<SyncCommitteeAttestationsData> => {
    try {
      // Dummy sync committee attestation processing logic
      console.log(`Processing sync committee attestations for slot ${input.slot}`);

      // Simulate some processing time
      await new Promise((resolve) => setTimeout(resolve, 100));

      return {
        slot: input.slot,
        syncCommitteeAttestations: [
          {
            validatorIndex: Math.floor(Math.random() * 1000),
          },
        ],
      };
    } catch (error) {
      console.error('Error processing sync committee attestations:', error);
      throw error;
    }
  },
);

/**
 * Actor to update validator statuses
 */
export const updateValidatorStatuses = fromPromise(
  async ({ input }: { input: ProcessSlotInput }): Promise<ValidatorStatusesData> => {
    try {
      // Dummy validator status update logic
      console.log(`Updating validator statuses for slot ${input.slot}`);

      // Simulate some processing time
      await new Promise((resolve) => setTimeout(resolve, 90));

      return {
        slot: input.slot,
        validatorUpdates: [
          {
            validatorIndex: Math.floor(Math.random() * 1000),
            status: 'active',
          },
        ],
      };
    } catch (error) {
      console.error('Error updating validator statuses:', error);
      throw error;
    }
  },
);

/**
 * Actor to process withdrawals
 */
export const processWithdrawals = fromPromise(
  async ({ input }: { input: ProcessSlotInput }): Promise<WithdrawalsData> => {
    try {
      // Dummy withdrawal processing logic
      console.log(`Processing withdrawals for slot ${input.slot}`);

      // Simulate some processing time
      await new Promise((resolve) => setTimeout(resolve, 110));

      return {
        slot: input.slot,
        withdrawals: [
          {
            validatorIndex: Math.floor(Math.random() * 1000),
            amount: Math.random() * 32,
          },
        ],
      };
    } catch (error) {
      console.error('Error processing withdrawals:', error);
      throw error;
    }
  },
);

/**
 * Actor to check and get committee validator amounts for attestations
 */
export const checkAndGetCommitteeValidatorsAmounts = fromPromise(
  async ({ input }: { input: { slot: number; beaconBlockData: Block } }) => {
    try {
      // Get unique slots from attestations in beacon block data
      const attestations = input.beaconBlockData.data.message.body.attestations || [];
      const uniqueSlots = [...new Set(attestations.map((att) => parseInt(att.data.slot)))].filter(
        (slot) => slot >= env.BEACON_LOOKBACK_SLOT,
      );

      if (uniqueSlots.length === 0) {
        throw new Error('No attestations found');
      }

      // Get committee validator counts for all slots
      const committeeValidatorCounts = await db_getSlotCommitteesValidatorsAmountsForSlots(
        uniqueSlots as number[],
      );

      // Check if all slots have validator counts
      const allSlotsHaveCounts = uniqueSlots.every((slot) => {
        const counts = committeeValidatorCounts[slot as number];
        return counts && counts.length > 0;
      });

      return {
        committeeValidatorCounts,
        allSlotsHaveCounts,
        uniqueSlots,
      };
    } catch (error) {
      console.error('Error checking committee validator amounts:', error);
      throw error;
    }
  },
);

/**
 * Actor to update slot processed status in database
 */
export const updateSlotProcessed = fromPromise(
  async ({ input }: { input: CheckSlotProcessedInput }) =>
    prisma.slot.update({
      where: {
        slot: input.slot,
      },
      data: {
        processed: true,
      },
    }),
);

/**
 * Actor to update attestations processed status in database
 */
export const updateAttestationsProcessed = fromPromise(
  async ({ input }: { input: CheckSlotProcessedInput }) =>
    prisma.slot.update({
      where: { slot: input.slot },
      data: { attestationsProcessed: true },
    }),
);

/**
 * Actor to find the next unprocessed slot between startSlot and endSlot
 * If no slots are processed, returns startSlot
 * If all slots are processed, returns null
 */
export const findMinUnprocessedSlotInEpoch = fromPromise(
  async ({ input }: { input: { startSlot: number; endSlot: number } }) => {
    try {
      const { startSlot, endSlot } = input;

      // Find the first unprocessed slot in the range
      const unprocessedSlot = await prisma.slot.findFirst({
        where: {
          slot: {
            gte: startSlot,
            lte: endSlot,
          },
          processed: false,
        },
        orderBy: {
          slot: 'asc',
        },
        select: {
          slot: true,
        },
      });

      // If no unprocessed slot found, all slots are processed
      if (!unprocessedSlot) {
        return null;
      }

      return unprocessedSlot.slot;
    } catch (error) {
      console.error('Error finding next unprocessed slot:', error);
      throw error;
    }
  },
);
