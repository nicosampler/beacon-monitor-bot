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
} from './slot.actors.js';

import { Block } from '@/src/beacon/types.js';
import { env } from '@/src/env.js';
import { pinoLog } from '@/src/xstate/pinoLog.js';

export interface SlotProcessorContext {
  epoch: number;
  slot: number;
  slotDb: Slot | null;
  beaconBlockData?: Block | 'SLOT MISSED';
  syncCommittee: string[] | null;
  committeeValidatorCounts?: Record<number, number[]>;
}

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
    input: SlotProcessorInput;
  },
  actions: {
    log_gettingSlot: pinoLog(
      ({ context }) => `Getting slot ${context.slot}`,
      'SlotProcessor:gettingSlot',
    ),
    error_slotNotFound: ({ context }) => {
      throw new Error(`Slot ${context.slot} not found or has no data`);
    },
    log_waitingForSlotToStart: pinoLog(
      ({ context }) => `Waiting for slot to start ${context.slot}`,
      'SlotProcessor:waitingForSlotToStart',
    ),
    log_fetchingBeaconBlock: pinoLog(
      ({ context }) => `Fetching beacon block ${context.slot}`,
      'SlotProcessor:fetchingBeaconBlock',
    ),
    log_processingSlotResponse: pinoLog(
      ({ context }) => `Processing slot response ${context.slot}`,
      'SlotProcessor:processingSlotResponse',
    ),
    log_markingSlotCompleted: pinoLog(
      ({ context }) => `Marking slot completed ${context.slot}`,
      'SlotProcessor:markingSlotCompleted',
    ),
    log_slotCompleted: pinoLog(
      ({ context }) => `Completed slot ${context.slot}`,
      'SlotProcessor:slotCompleted',
    ),
    log_processingExecutionRewards: pinoLog(
      ({ context }) => `fetching execution rewards for slot ${context.slot}`,
      'SlotProcessor:executionRewards',
    ),
    log_completeExecutionRewards: pinoLog(
      ({ context }) => `complete execution rewards for slot ${context.slot}`,
      'SlotProcessor:executionRewards',
    ),
    log_waitingForSyncCommittee: pinoLog(
      ({ context }) => `waiting for sync committee for slot ${context.slot}`,
      'SlotProcessor:blockAndSyncRewards',
    ),
    log_blockAndSyncRewardsProcessing: pinoLog(
      ({ context }) => `fetching block and sync rewards for slot ${context.slot}`,
      'SlotProcessor:blockAndSyncRewards',
    ),
    log_completeBlockAndSyncRewards: pinoLog(
      ({ context }) => `complete block and sync rewards for slot ${context.slot}`,
      'SlotProcessor:blockAndSyncRewards',
    ),
    log_waitingForCommitteeValidatorsAmounts: pinoLog(
      ({ context }) => `waiting for sync committee for slot ${context.slot}`,
      'SlotProcessor:attestations',
    ),
    log_processingAttestations: pinoLog(
      ({ context }) => `processing attestations for slot ${context.slot}`,
      'SlotProcessor:attestations',
    ),
    log_updateAttestationsProcessed: pinoLog(
      ({ context }) => `updating processed flag for slot ${context.slot}`,
      'SlotProcessor:attestations',
    ),
    log_completeAttestations: pinoLog(
      ({ context }) => `complete  slot ${context.slot}`,
      'SlotProcessor:attestations',
    ),
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
  guards: {
    isSlotNotFound: ({ context }) => context.slotDb === null,
    isSlotAlreadyProcessed: ({ context }) => context.slotDb?.processed === true,
    isSlotReady: ({ event }) => event.output?.isReady === true,
    isSlotMissed: ({ context }) => context.beaconBlockData === 'SLOT MISSED',
    isSlotNotMissed: ({ context }) => context.beaconBlockData !== 'SLOT MISSED',
    areExecutionRewardsProcessed: ({ context }) =>
      context.slotDb?.executionRewardsProcessed === true,
    areBlockAndSyncRewardsProcessed: ({ context }) =>
      context.slotDb?.blockAndSyncRewardsProcessed === true,
    hasSyncCommittee: ({ event }) => event.output?.syncCommittee !== null,
    areAttestationsProcessed: ({ context }) => context.slotDb?.attestationsProcessed === true,
    isLookbackSlot: ({ context }) => context.slot === env.BEACON_LOOKBACK_SLOT,
    allSlotsHaveCounts: ({ event }) => event.output?.allSlotsHaveCounts === true,
    canProcessAttestations: ({ event }) => event.output?.canProcessAttestations === true,
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
      entry: 'log_gettingSlot',
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
      },
    },

    /*
     * Analyzing the slot
     * We check if the slot is already processed
     * If it is, we transition to completed
     * If it is not, we transition to checkingIfSlotIsReady
     */
    analyzingSlot: {
      always: [
        {
          guard: 'isSlotAlreadyProcessed',
          target: 'completed',
        },
        {
          target: 'checkingIfSlotIsReady',
        },
      ],
    },

    /*
     * Checking if the slot is ready
     * We can only fetch up current slot - env.BEACON_DELAY_SLOTS_TO_HEAD
     * For example if BEACON_DELAY_SLOTS_TO_HEAD is 2, we can only fetch up to current slot - 2
     * Also, is important to note that data for slot n comes at slot n+1.
     */
    checkingIfSlotIsReady: {
      invoke: {
        src: 'checkSlotReady',
        input: ({ context }) => ({ slot: context.slot }),
        onDone: [
          {
            guard: 'isSlotReady',
            target: 'fetchingBeaconSlot',
          },
          {
            target: 'waitingForSlotToStart',
          },
        ],
      },
    },

    waitingForSlotToStart: {
      entry: 'log_waitingForSlotToStart',
      after: {
        [ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS / 3}ms`)]: 'checkingIfSlotIsReady',
      },
    },

    /*
     * Fetching the beacon block data
     * We fetch the beacon block data from the beacon node
     * Then we assign the beacon block data to the context
     */
    fetchingBeaconSlot: {
      entry: 'log_fetchingBeaconBlock',
      invoke: {
        src: 'fetchBeaconBlock',
        input: ({ context }) => ({ slot: context.slot }),
        onDone: {
          target: 'processingBeaconSlot',
          actions: assign({
            beaconBlockData: ({ event }) => event.output,
          }),
        },
      },
    },

    /*
     * Processing the slot response to determine next action
     * If the response is 'SLOT MISSED', mark slot as completed and transition to completed
     * If the response has beacon data, transition to processingData
     */
    processingBeaconSlot: {
      entry: 'log_processingSlotResponse',
      always: [
        {
          guard: 'isSlotMissed',
          target: 'markingSlotCompleted',
        },
        {
          guard: 'isSlotNotMissed',
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
                  guard: 'areExecutionRewardsProcessed',
                  target: 'complete',
                },
                {
                  target: 'processing',
                },
              ],
            },
            processing: {
              entry: 'log_processingExecutionRewards',
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
            complete: {
              type: 'final',
              entry: 'log_completeExecutionRewards',
            },
          },
        },

        blockAndSyncRewards: {
          initial: 'checkingCompletion',
          states: {
            checkingCompletion: {
              always: [
                {
                  guard: 'areBlockAndSyncRewardsProcessed',
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
                    guard: 'hasSyncCommittee',
                    actions: assign({
                      syncCommittee: ({ event }) => event.output.syncCommittee,
                    }),
                    target: 'blockAndSyncRewardsProcessing',
                  },
                  {
                    target: 'waitingForSyncCommittee',
                  },
                ],
              },
            },

            waitingForSyncCommittee: {
              entry: 'log_waitingForSyncCommittee',
              after: {
                [ms('1s')]: 'syncCommitteeCheck',
              },
            },

            blockAndSyncRewardsProcessing: {
              entry: 'log_blockAndSyncRewardsProcessing',
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

            complete: {
              type: 'final',
              entry: 'log_completeBlockAndSyncRewards',
            },
          },
        },

        attestations: {
          initial: 'checkingCompletion',
          states: {
            checkingCompletion: {
              always: [
                {
                  guard: 'areAttestationsProcessed',
                  target: 'complete',
                },
                {
                  // Base case: slot n comes at slot n + 1
                  guard: 'isLookbackSlot',
                  target: 'updateAttestationsProcessed',
                },
                {
                  target: 'gettingCommitteeValidatorsAmounts',
                },
              ],
            },
            gettingCommitteeValidatorsAmounts: {
              invoke: {
                src: 'checkAndGetCommitteeValidatorsAmounts',
                input: ({ context }) => ({
                  slot: context.slot,
                  beaconBlockData: context.beaconBlockData as Block,
                }),
                onDone: [
                  {
                    guard: 'allSlotsHaveCounts',
                    target: 'processingAttestations',
                    actions: assign({
                      // slot -> validator indexes
                      committeeValidatorCounts: ({ event }) =>
                        event.output.committeeValidatorCounts,
                    }),
                  },
                  {
                    target: 'waitingForCommitteeValidatorsAmounts',
                  },
                ],
              },
            },
            waitingForCommitteeValidatorsAmounts: {
              entry: 'log_waitingForCommitteeValidatorsAmounts',
              after: {
                [ms('1s')]: 'gettingCommitteeValidatorsAmounts',
              },
            },
            processingAttestations: {
              entry: 'log_processingAttestations',
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
                  target: 'complete',
                },
              },
            },
            updateAttestationsProcessed: {
              entry: 'log_updateAttestationsProcessed',
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
            complete: {
              entry: 'log_completeAttestations',
              type: 'final',
            },
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
      entry: 'log_markingSlotCompleted',
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
      entry: [sendParent({ type: 'SLOT_COMPLETED' }), 'log_slotCompleted'],
      type: 'final',
    },
  },
});
