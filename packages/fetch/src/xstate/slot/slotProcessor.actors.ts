import { fromPromise } from 'xstate';

import { beacon_blocks } from '@/src/beacon/endpoints.js';
import { Block } from '@/src/beacon/types.js';
import { getSlotNumberFromTimestamp } from '@/src/beacon/utils/time.js';
import { env } from '@/src/env.js';
import { getBlock } from '@/src/execution/endpoints.js';
import { getPrisma } from '@/src/lib/prisma.js';

const prisma = getPrisma();

export interface ProcessSlotInput {
  slot: number;
  epoch: number;
  beaconBlockData?: BeaconBlockData;
}

export interface CheckSlotProcessedInput {
  slot: number;
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
export const getOrCreateSlot = fromPromise(async ({ input }: { input: CheckSlotProcessedInput }) =>
  prisma.slot.upsert({
    where: {
      slot: input.slot,
    },
    create: {
      slot: input.slot,
      processed: false,
    },
    update: {
      processed: true,
    },
  }),
);

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
  async ({ input }: { input: { block: number; timestamp: number } }) => {
    const blockInfo = await getBlock(input.block);
    if (!blockInfo) {
      throw new Error(`Block ${input.block} not found`);
    }
    await prisma.executionRewards.create({
      data: blockInfo,
    });
  },
);

/**
 * Actor to fetch block and sync rewards
 */
export const fetchBlockAndSyncRewards = fromPromise(
  async ({ input }: { input: ProcessSlotInput }): Promise<BlockAndSyncRewardsData> => {
    try {
      // Dummy block and sync rewards fetching logic
      console.log(`Fetching block and sync rewards for slot ${input.slot}`);

      // Simulate some processing time
      await new Promise((resolve) => setTimeout(resolve, 180));

      return {
        slot: input.slot,
        blockRewards: Math.random() * 500,
        syncRewards: Math.random() * 300,
      };
    } catch (error) {
      console.error('Error fetching block and sync rewards:', error);
      throw error;
    }
  },
);

/**
 * Actor to process attestations
 */
export const processAttestations = fromPromise(
  async ({ input }: { input: ProcessSlotInput }): Promise<AttestationsData> => {
    try {
      // Dummy attestation processing logic
      console.log(`Processing attestations for slot ${input.slot}`);

      // Simulate some processing time
      await new Promise((resolve) => setTimeout(resolve, 120));

      return {
        slot: input.slot,
        attestations: [
          {
            validatorIndex: Math.floor(Math.random() * 1000),
            committeeIndex: Math.floor(Math.random() * 64),
          },
        ],
      };
    } catch (error) {
      console.error('Error processing attestations:', error);
      throw error;
    }
  },
);

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
