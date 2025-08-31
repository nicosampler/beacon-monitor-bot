import { Slot } from '@prisma/client';
import ms from 'ms';
import { setup, assign, sendParent } from 'xstate';

import {
  getSlot,
  checkSlotReady,
  fetchBeaconBlock,
  fetchELRewards,
  fetchBlockAndSyncRewards,
  checkSyncCommittee,
  processAttestations,
  processSyncCommitteeAttestations,
  updateValidatorStatuses,
  processWithdrawals,
  updateSlotProcessed,
  checkAndGetCommitteeValidatorsAmounts,
  cleanupOldCommittees,
  updateAttestationsProcessed,
} from './slotProcessor.actors.js';

import { Block } from '@/src/beacon/types.js';
import { env } from '@/src/env.js';

export interface SlotProcessorContext {
  epoch: number;
  slot: number;
  slotDb: Slot | null;
  beaconBlockData?: Block | 'SLOT MISSED';
  syncCommittee: string[] | null;
  committeeValidatorCounts?: Record<number, number[]>;
}

export type SlotProcessorEvents = { type: 'SLOT_COMPLETED' };

export interface SlotProcessorInput {
  epoch: number;
  slot: number;
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
  types: {} as {
    context: SlotProcessorContext;
    events: SlotProcessorEvents;
    input: SlotProcessorInput;
  },
  actors: {
    getSlot,
    checkSlotReady,
    fetchBeaconBlock,
    fetchELRewards,
    fetchBlockAndSyncRewards,
    checkSyncCommittee,
    processAttestations,
    processSyncCommitteeAttestations,
    updateValidatorStatuses,
    processWithdrawals,
    updateSlotProcessed,
    checkAndGetCommitteeValidatorsAmounts,
    cleanupOldCommittees,
    updateAttestationsProcessed,
  },
}).createMachine({
  id: 'SlotProcessor',
  initial: 'gettingSlot',
  context: ({ input }) => ({
    epoch: input.epoch,
    slot: input.slot,
    slotDb: null,
    syncCommittee: null,
  }),
  states: {
    /*
     * Getting the slot from the database
     * If the slot is not in the database, we create it
     * Then we assign the slot to the context
     */
    gettingSlot: {
      invoke: {
        src: 'getSlot',
        input: ({ context }) => ({ slot: context.slot }),
        onDone: [
          {
            actions: assign({
              slotDb: ({ event }) => event.output,
            }),
            target: 'analyzingSlot',
          },
        ],
        onError: {
          target: 'gettingSlot',
          actions: ({ event }) => {
            console.error('Error getting slot:', event.error);
          },
        },
      },
    },

    analyzingSlot: {
      always: [
        {
          guard: ({ context }) => context.slotDb === null,
          target: 'slotNotFound',
        },
        {
          guard: ({ context }) => context.slotDb?.processed === true,
          target: 'completed',
        },
        {
          target: 'checkingIfSlotIsReady',
        },
      ],
    },

    slotNotFound: {
      entry: ({ context }) => {
        throw new Error(`Slot ${context.slot} not found or has no data`);
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
     * If the response is 'SLOT MISSED', mark slot as completed and transition to completed
     * If the response has beacon data, transition to processingData
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
          initial: 'checkingCompletion',
          states: {
            checkingCompletion: {
              always: [
                {
                  guard: ({ context }) => context.slotDb?.executionRewardsProcessed === true,
                  target: 'complete',
                },
                {
                  target: 'processing',
                },
              ],
            },
            processing: {
              invoke: {
                src: 'fetchELRewards',
                input: ({ context }) => {
                  const _beaconBlockData = context.beaconBlockData as Block;
                  return {
                    slot: context.slot,
                    block: Number(
                      _beaconBlockData.data.message.body.execution_payload.block_number,
                    ),
                    timestamp: Number(
                      _beaconBlockData.data.message.body.execution_payload.timestamp,
                    ),
                  };
                },
                onDone: {
                  target: 'complete',
                },
                onError: {
                  target: 'processing',
                  actions: ({ event }) => {
                    console.error('Error fetching execution rewards:', event.error);
                  },
                },
              },
            },
            complete: { type: 'final' },
          },
        },

        blockAndSyncRewards: {
          initial: 'blockAndSyncRewardsCheck',
          states: {
            blockAndSyncRewardsCheck: {
              always: [
                {
                  guard: ({ context }) => context.slotDb?.blockAndSyncRewardsProcessed === true,
                  target: 'complete',
                },
                {
                  target: 'syncCommitteeCheck',
                },
              ],
            },

            syncCommitteeCheck: {
              invoke: {
                src: 'checkSyncCommittee',
                input: ({ context }) => ({ epoch: context.epoch }),
                onDone: [
                  {
                    guard: ({ event }) => event.output.syncCommittee !== null,
                    actions: assign({
                      syncCommittee: ({ event }) => event.output.syncCommittee,
                    }),
                    target: 'blockAndSyncRewardsProcessing',
                  },
                  {
                    target: 'syncCommitteeRetry',
                  },
                ],
                onError: {
                  target: 'syncCommitteeRetry',
                },
              },
            },

            syncCommitteeRetry: {
              after: {
                [ms('1s')]: 'syncCommitteeCheck',
              },
            },

            blockAndSyncRewardsProcessing: {
              invoke: {
                src: 'fetchBlockAndSyncRewards',
                input: ({ context }) => {
                  const _beaconBlockData = context.beaconBlockData as Block;
                  return {
                    slot: context.slot,
                    timestamp: Number(
                      _beaconBlockData.data.message.body.execution_payload.timestamp,
                    ),
                    syncCommitteeValidators: context.syncCommittee ?? [],
                  };
                },
                onDone: {
                  target: 'complete',
                  actions: assign({}),
                },
                onError: {
                  target: 'blockAndSyncRewardsProcessing',
                },
              },
            },

            // TODO:prefetchBlockAndSyncRewards if the head is behind

            complete: { type: 'final' },
          },
        },

        attestations: {
          initial: 'attestationsCheck',
          states: {
            attestationsCheck: {
              always: [
                {
                  guard: ({ context }) => context.slotDb?.attestationsProcessed === true,
                  target: 'complete',
                },
                {
                  // Base case: slot n comes at slot n + 1
                  guard: ({ context }) => context.slot === env.BEACON_LOOKBACK_SLOT,
                  target: 'updateAttestationsProcessed',
                },
                {
                  target: 'checkAndGetCommitteeValidatorsAmounts',
                },
              ],
            },
            checkAndGetCommitteeValidatorsAmounts: {
              invoke: {
                src: 'checkAndGetCommitteeValidatorsAmounts',
                input: ({ context }) => ({
                  slot: context.slot,
                  beaconBlockData: context.beaconBlockData as Block,
                }),
                onDone: [
                  {
                    guard: ({ event }) => event.output.allSlotsHaveCounts === true,
                    target: 'attestationsProcessing',
                    actions: assign({
                      // slot -> validator indexes
                      committeeValidatorCounts: ({ event }) =>
                        event.output.committeeValidatorCounts,
                    }),
                  },
                  {
                    target: 'committeeValidatorsRetry',
                  },
                ],
                onError: {
                  target: 'committeeValidatorsRetry',
                },
              },
            },
            committeeValidatorsRetry: {
              after: {
                [ms('1s')]: 'checkAndGetCommitteeValidatorsAmounts',
              },
            },
            attestationsProcessing: {
              invoke: {
                src: 'processAttestations',
                input: ({ context }) => {
                  const _beaconBlockData = context.beaconBlockData as Block;

                  return {
                    slotNumber: context.slot,
                    attestations: _beaconBlockData.data.message.body.attestations ?? [],
                    slotCommitteesValidatorsAmounts: context.committeeValidatorCounts ?? {},
                  };
                },
                onDone: {
                  target: 'committeeCleanup',
                  actions: assign({}),
                },
                onError: {
                  target: 'attestationsProcessing',
                },
              },
            },
            committeeCleanup: {
              invoke: {
                src: 'cleanupOldCommittees',
                input: ({ context }) => ({
                  slot: context.slot,
                }),
                onDone: {
                  target: 'complete',
                  actions: assign({}),
                },
                onError: {
                  target: 'committeeCleanup',
                },
              },
            },
            updateAttestationsProcessed: {
              invoke: {
                src: 'updateAttestationsProcessed',
                input: ({ context }) => ({ slot: context.slot }),
                onDone: {
                  target: 'complete',
                },
                onError: {
                  target: 'updateAttestationsProcessed',
                },
              },
            },
            complete: { type: 'final' },
          },
        },

        // validatorStatuses: {
        //   initial: 'validatorStatusesCheck',
        //   // context para pasar los validadores y hacer fetch de sus estados.
        //   states: {
        //     validatorStatusesCheck: {
        //       always: [
        //         {
        //           guard: ({ context }) => context.slotDb?.validatorsStatusesProcessed === true,
        //           target: 'validatorStatusesComplete',
        //         },
        //         {
        //           target: 'validatorStatusesProcessing',
        //         },
        //       ],
        //     },
        //     validatorStatusesProcessing: {
        //       invoke: {
        //         src: 'updateValidatorStatuses',
        //         input: ({ context }) => ({
        //           slot: context.slot,
        //           epoch: context.epoch,
        //           beaconBlockData:
        //             context.beaconBlockData && context.beaconBlockData !== 'SLOT MISSED'
        //               ? {
        //                   slot: parseInt(context.beaconBlockData.data.message.slot),
        //                   epoch: context.epoch,
        //                   blockHash: context.beaconBlockData.data.message.body.eth1_data.block_hash,
        //                   proposerIndex: parseInt(
        //                     context.beaconBlockData.data.message.proposer_index,
        //                   ),
        //                 }
        //               : undefined,
        //         }),
        //         onDone: {
        //           target: 'validatorStatusesComplete',
        //           actions: assign({}),
        //         },
        //         onError: {
        //           target: 'validatorStatusesProcessing',
        //         },
        //       },
        //     },

        //     validatorStatusesComplete: { type: 'final' },
        //   },
        // },

        //withdrawal_credentials.slice(-40)
        // withdrawals: {
        //   initial: 'withdrawalsCheck',
        //   states: {
        //     withdrawalsCheck: {
        //       always: [
        //         {
        //           guard: ({ context }) => context.slotDb?.withdrawalsProcessed === true,
        //           target: 'withdrawalsComplete',
        //         },
        //         {
        //           target: 'withdrawalsProcessing',
        //         },
        //       ],
        //     },
        //     withdrawalsProcessing: {
        //       invoke: {
        //         src: 'processWithdrawals',
        //         input: ({ context }) => ({
        //           slot: context.slot,
        //           epoch: context.epoch,
        //           beaconBlockData:
        //             context.beaconBlockData && context.beaconBlockData !== 'SLOT MISSED'
        //               ? {
        //                   slot: parseInt(context.beaconBlockData.data.message.slot),
        //                   epoch: context.epoch,
        //                   blockHash: context.beaconBlockData.data.message.body.eth1_data.block_hash,
        //                   proposerIndex: parseInt(
        //                     context.beaconBlockData.data.message.proposer_index,
        //                   ),
        //                 }
        //               : undefined,
        //         }),
        //         onDone: {
        //           target: 'withdrawalsComplete',
        //           actions: assign({}),
        //         },
        //         onError: {
        //           target: 'withdrawalsProcessing',
        //         },
        //       },
        //     },
        //     withdrawalsComplete: { type: 'final' },
        //   },
        // },
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
      entry: sendParent({ type: 'SLOT_COMPLETED' }),
      type: 'final',
    },
  },
});
