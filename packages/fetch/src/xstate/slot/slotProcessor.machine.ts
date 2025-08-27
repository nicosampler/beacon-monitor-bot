import { Slot } from '@prisma/client';
import ms from 'ms';
import { setup, assign } from 'xstate';

import {
  getOrCreateSlot,
  checkSlotReady,
  fetchBeaconBlock,
  fetchELRewards,
  fetchBlockAndSyncRewards,
  processAttestations,
  processSyncCommitteeAttestations,
  updateValidatorStatuses,
  processWithdrawals,
  updateSlotProcessed,
} from './slotProcessor.actors.js';

import { Block } from '@/src/beacon/types.js';
import { getEpochSlots } from '@/src/beacon/utils/misc.js';
import { env } from '@/src/env.js';

export interface SlotProcessorContext {
  epoch: number;
  slot: number;
  slotDb: Slot | null;
  beaconBlockData?: Block | 'SLOT MISSED';
}

export type SlotProcessorEvents = { type: 'SLOT_COMPLETED' };

export interface SlotProcessorInput {
  epoch: number;
}

export interface SlotProcessorSetup {
  context: SlotProcessorContext;
  events: SlotProcessorEvents;
  input: SlotProcessorInput;
}

/**
 * @fileoverview The slot processor is a state machine that is responsible for processing individual slots.
 *
 * It is responsible for:
 * - Fetching and processing beacon block data
 * - Processing different types of data in parallel:
 *   - Execution Layer rewards
 *   - Block and sync rewards
 *   - Attestations
 *   - Sync committee attestations
 *   - Validator status updates
 *   - Withdrawals
 * - Handling errors with retry logic
 * - Emitting completion events
 *
 * This machine processes one slot at a time.
 */

export const slotProcessorMachine = setup({
  types: {} as SlotProcessorSetup,
  actors: {
    getOrCreateSlot,
    checkSlotReady,
    fetchBeaconBlock,
    fetchELRewards,
    fetchBlockAndSyncRewards,
    processAttestations,
    processSyncCommitteeAttestations,
    updateValidatorStatuses,
    processWithdrawals,
    updateSlotProcessed,
  },
}).createMachine({
  id: 'SlotProcessor',
  initial: 'checkingSlotStatus',
  context: ({ input }) => ({
    epoch: input.epoch,
    slot: getEpochSlots(input.epoch).startSlot,
    slotDb: null,
  }),
  states: {
    /*
     * Getting the slot from the database
     * If the slot is not in the database, we create it
     * Then we assign the slot to the context
     */
    gettingSlot: {
      invoke: {
        src: 'getOrCreateSlot',
        input: ({ context }) => ({ slot: context.slot }),
        onDone: [
          {
            actions: assign({
              slotDb: ({ event }) => event.output,
            }),
            guard: ({ event }) => event.output.processed === true,
            target: 'completed',
          },
          {
            target: 'checkingIfSlotIsReady',
          },
        ],
        onError: {
          target: 'gettingSlot',
        },
      },
    },

    /*
     * Checking if the slot is ready
     * We can only fetch up current slot - env.BEACON_DELAY_SLOTS_TO_HEAD
     * For example if BEACON_DELAY_SLOTS_TO_HEAD is 2, we can only fetch up to current slot - 2
     */
    checkingIfSlotIsReady: {
      invoke: {
        src: 'checkSlotReady',
        input: ({ context }) => ({ slot: context.slot }),
        onDone: [
          {
            guard: ({ event }) => event.output.isReady === true,
            target: 'fetchingBeaconBlockData',
          },
          {
            target: 'retryingCheckingIfSlotIsReady',
          },
        ],
        onError: {
          target: 'retryingCheckingIfSlotIsReady',
        },
      },
    },

    retryingCheckingIfSlotIsReady: {
      after: {
        [ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS / 3}ms`)]: 'checkingIfSlotIsReady',
      },
    },

    /*
     * Fetching the beacon block data
     * We fetch the beacon block data from the beacon node
     * Then we assign the beacon block data to the context
     */
    fetchingBeaconBlockData: {
      invoke: {
        src: 'fetchBeaconBlock',
        input: ({ context }) => ({ slot: context.slot }),
        onDone: {
          target: 'processingSlotResponse',
          actions: assign({
            beaconBlockData: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'retryingFetchingBeaconBlock',
        },
      },
    },

    retryingFetchingBeaconBlock: {
      after: {
        [ms('500ms')]: 'fetchingBeaconBlockData',
      },
    },

    /*
     * Processing the slot response to determine next action
     * If response is 'SLOT MISSED', mark slot as completed and transition to completed
     * If response is beacon data, transition to processingData
     */
    processingSlotResponse: {
      always: [
        {
          guard: ({ context }) => context.beaconBlockData === 'SLOT MISSED',
          target: 'markingSlotCompleted',
        },
        {
          guard: ({ context }) => context.beaconBlockData !== 'SLOT MISSED',
          target: 'processingData',
        },
      ],
    },

    /*
     * Getting all the slot data in parallel
     * Execution rewards.
     * Block and sync rewards.
     * Attestations.
     * Validator statuses.
     * Withdrawals.
     * We wait for all the data to be processed before marking the slot as completed
     */
    processingData: {
      type: 'parallel',
      onDone: 'markingSlotCompleted',
      states: {
        executionRewards: {
          initial: 'executionRewardsCheck',
          states: {
            executionRewardsCheck: {
              always: [
                {
                  guard: ({ context }) => context.slotDb?.executionRewardsProcessed === true,
                  target: 'executionRewardsComplete',
                },
                {
                  target: 'executionRewardsProcessing',
                },
              ],
            },
            executionRewardsProcessing: {
              invoke: {
                src: 'fetchELRewards',
                input: ({ context }) => {
                  const _beaconBlockData = context.beaconBlockData as Block;
                  return {
                    block: Number(
                      _beaconBlockData.data.message.body.execution_payload.block_number,
                    ),
                    timestamp: Number(
                      _beaconBlockData.data.message.body.execution_payload.timestamp,
                    ),
                  };
                },
                onDone: {
                  target: 'executionRewardsComplete',
                  actions: assign({}),
                },
                onError: {
                  target: 'executionRewardsProcessing',
                },
              },
            },
            executionRewardsComplete: { type: 'final' },
          },
        },

        blockAndSyncRewards: {
          initial: 'blockAndSyncRewardsCheck',
          states: {
            blockAndSyncRewardsCheck: {
              always: [
                {
                  guard: ({ context }) => context.slotDb?.blockAndSyncRewardsProcessed === true,
                  target: 'blockAndSyncRewardsComplete',
                },
                {
                  target: 'blockAndSyncRewardsProcessing',
                },
              ],
            },
            blockAndSyncRewardsProcessing: {
              invoke: {
                src: 'fetchBlockAndSyncRewards',
                input: ({ context }) => ({
                  slot: context.slot,
                  epoch: context.epoch,
                  beaconBlockData: context.beaconBlockData
                    ? {
                        slot: parseInt(context.beaconBlockData.data.message.slot),
                        epoch: context.epoch,
                        blockHash: context.beaconBlockData.data.message.body.eth1_data.block_hash,
                        proposerIndex: parseInt(
                          context.beaconBlockData.data.message.proposer_index,
                        ),
                      }
                    : undefined,
                }),
                onDone: {
                  target: 'blockAndSyncRewardsComplete',
                  actions: assign({}),
                },
                onError: {
                  target: 'blockAndSyncRewardsProcessing',
                },
              },
            },
            blockAndSyncRewardsComplete: { type: 'final' },
          },
        },

        attestations: {
          initial: 'attestationsCheck',
          states: {
            attestationsCheck: {
              always: [
                {
                  guard: ({ context }) => context.slotDb?.attestationsProcessed === true,
                  target: 'attestationsComplete',
                },
                {
                  target: 'attestationsProcessing',
                },
              ],
            },
            attestationsProcessing: {
              invoke: {
                src: 'processAttestations',
                input: ({ context }) => ({
                  slot: context.slot,
                  epoch: context.epoch,
                  beaconBlockData: context.beaconBlockData
                    ? {
                        slot: parseInt(context.beaconBlockData.data.message.slot),
                        epoch: context.epoch,
                        blockHash: context.beaconBlockData.data.message.body.eth1_data.block_hash,
                        proposerIndex: parseInt(
                          context.beaconBlockData.data.message.proposer_index,
                        ),
                      }
                    : undefined,
                }),
                onDone: {
                  target: 'attestationsComplete',
                  actions: assign({}),
                },
                onError: {
                  target: 'attestationsProcessing',
                },
              },
            },
            attestationsComplete: { type: 'final' },
          },
        },

        validatorStatuses: {
          initial: 'validatorStatusesCheck',
          states: {
            validatorStatusesCheck: {
              always: [
                {
                  guard: ({ context }) => context.slotDb?.validatorsStatusesProcessed === true,
                  target: 'validatorStatusesComplete',
                },
                {
                  target: 'validatorStatusesProcessing',
                },
              ],
            },
            validatorStatusesProcessing: {
              invoke: {
                src: 'updateValidatorStatuses',
                input: ({ context }) => ({
                  slot: context.slot,
                  epoch: context.epoch,
                  beaconBlockData: context.beaconBlockData
                    ? {
                        slot: parseInt(context.beaconBlockData.data.message.slot),
                        epoch: context.epoch,
                        blockHash: context.beaconBlockData.data.message.body.eth1_data.block_hash,
                        proposerIndex: parseInt(
                          context.beaconBlockData.data.message.proposer_index,
                        ),
                      }
                    : undefined,
                }),
                onDone: {
                  target: 'validatorStatusesComplete',
                  actions: assign({}),
                },
                onError: {
                  target: 'validatorStatusesProcessing',
                },
              },
            },
            validatorStatusesComplete: { type: 'final' },
          },
        },

        withdrawals: {
          initial: 'withdrawalsCheck',
          states: {
            withdrawalsCheck: {
              always: [
                {
                  guard: ({ context }) => context.slotDb?.withdrawalsProcessed === true,
                  target: 'withdrawalsComplete',
                },
                {
                  target: 'withdrawalsProcessing',
                },
              ],
            },
            withdrawalsProcessing: {
              invoke: {
                src: 'processWithdrawals',
                input: ({ context }) => ({
                  slot: context.slot,
                  epoch: context.epoch,
                  beaconBlockData: context.beaconBlockData
                    ? {
                        slot: parseInt(context.beaconBlockData.data.message.slot),
                        epoch: context.epoch,
                        blockHash: context.beaconBlockData.data.message.body.eth1_data.block_hash,
                        proposerIndex: parseInt(
                          context.beaconBlockData.data.message.proposer_index,
                        ),
                      }
                    : undefined,
                }),
                onDone: {
                  target: 'withdrawalsComplete',
                  actions: assign({}),
                },
                onError: {
                  target: 'withdrawalsProcessing',
                },
              },
            },
            withdrawalsComplete: { type: 'final' },
          },
        },
      },
    },

    /*
     * Marking the slot as completed when it was missed
     * This state handles slots that didn't produce a block
     */
    markingSlotCompleted: {
      invoke: {
        src: 'updateSlotProcessed',
        input: ({ context }) => ({ slot: context.slot }),
        onDone: {
          target: 'completed',
        },
        onError: {
          target: 'markingSlotCompleted',
        },
      },
    },

    completed: {
      type: 'final',
    },
  },
});
