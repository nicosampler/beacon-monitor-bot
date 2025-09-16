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
  processWithdrawalsRewards,
  processWithdrawalsRewardsData,
  updateWithdrawalsProcessed,
  processClDeposits,
  processClVoluntaryExits,
  processElDeposits,
  processElWithdrawals,
  processElConsolidations,
  updateSlotWithBeaconData,
} from './slot.actors.js';

import { Block } from '@/src/beacon/types.js';
import { env } from '@/src/env.js';
import { pinoLog } from '@/src/xstate/pinoLog.js';

export interface SlotProcessorContext {
  epoch: number;
  slot: number;
  slotDb: Slot | null;
  beaconBlockData?: {
    rawData: Block | 'SLOT MISSED';
    withdrawalRewards: string[];
    clDeposits: string[];
    clVoluntaryExits: string[];
    elDeposits: string[];
    elWithdrawals: string[];
    elConsolidations: string[];
  };
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
    processWithdrawalsRewards,
    processWithdrawalsRewardsData,
    updateWithdrawalsProcessed,
    processClDeposits,
    processClVoluntaryExits,
    processElDeposits,
    processElWithdrawals,
    processElConsolidations,
    updateSlotWithBeaconData,
  },
  guards: {
    isSlotNotFound: ({ context }) => context.slotDb === null,
    isSlotAlreadyProcessed: ({ context }) => context.slotDb?.processed === true,
    isSlotReady: ({ event }) => event.output?.isReady === true,
    isSlotMissed: ({ context }) => context.beaconBlockData?.rawData === 'SLOT MISSED',
    isSlotNotMissed: ({ context }) => context.beaconBlockData?.rawData !== 'SLOT MISSED',
    areExecutionRewardsProcessed: ({ context }) =>
      context.slotDb?.executionRewardsProcessed === true,
    areBlockAndSyncRewardsProcessed: ({ context }) =>
      context.slotDb?.blockAndSyncRewardsProcessed === true,
    hasSyncCommittee: ({ event }) => event.output?.syncCommittee !== null,
    areAttestationsProcessed: ({ context }) => context.slotDb?.attestationsProcessed === true,
    isLookbackSlot: ({ context }) => context.slot === env.BEACON_LOOKBACK_SLOT,
    allSlotsHaveCounts: ({ event }) => event.output?.allSlotsHaveCounts === true,
    canProcessAttestations: ({ event }) => event.output?.canProcessAttestations === true,
    areWithdrawalsRewardsProcessed: ({ context }) =>
      context.slotDb?.withdrawalsRewardsProcessed !== null,
    isBeaconSlotAlreadyProcessed: ({ context }) => context.slotDb?.blockProcessed === true,
  },
}).createMachine({
  id: 'SlotProcessor',
  initial: 'gettingSlot',
  context: ({ input }) => ({
    epoch: input.epoch,
    slot: input.slot,
    slotDb: null,
    syncCommittee: null,
    beaconBlockData: undefined,
  }),

  states: {
    gettingSlot: {
      description:
        'Getting the slot from the database. If the slot is not in the database, is created. Then the slot is assigned to the context.',
      entry: pinoLog(({ context }) => `Getting slot ${context.slot}`, 'SlotProcessor:gettingSlot'),
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

    analyzingSlot: {
      description: 'Checking if the slot is already processed.',
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

    checkingIfSlotIsReady: {
      description:
        'Checking if the slot is ready. We can only fetch up current slot - env.BEACON_DELAY_SLOTS_TO_HEAD. Is important to note that attestations for slot n comes at slot n+1.',
      invoke: {
        src: 'checkSlotReady',
        input: ({ context }) => ({ slot: context.slot }),
        onDone: [
          {
            guard: 'isSlotReady',
            target: 'processingSlot',
          },
          {
            target: 'waitingForSlotToStart',
          },
        ],
      },
    },

    waitingForSlotToStart: {
      entry: pinoLog(
        ({ context }) => `Waiting for slot ${context.slot} to start`,
        'SlotProcessor:waitingForSlotToStart',
      ),
      after: {
        [ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS / 3}ms`)]: 'checkingIfSlotIsReady',
      },
    },

    processingData: {
      description:
        'Getting all the slot data in parallel. Execution rewards. Block and sync rewards. Attestations. Validator statuses. Withdrawals. We wait for all the data to be processed before marking the slot as completed.',
      type: 'parallel',
      onDone: 'updatingSlotProcessed',
      states: {
        beaconSlotData: {
          description:
            'Processing the beacon slot data. First check if already processed, then fetch data and process all types in parallel.',
          initial: 'checking',
          states: {
            checking: {
              description: 'Check if beacon slot data is already processed, if not fetch data',
              always: [
                {
                  guard: 'isBeaconSlotAlreadyProcessed',
                  target: 'complete',
                },
                {
                  target: 'fetchingBeaconSlot',
                },
              ],
            },
            fetchingBeaconSlot: {
              description:
                'Fetching the beacon block data from the beacon node. Then we assign the response to the context which is used in the processing data states.',
              entry: pinoLog(
                ({ context }) => `Fetching beacon block ${context.slot}`,
                'SlotProcessor:fetchingBeaconBlock',
              ),
              invoke: {
                src: 'fetchBeaconBlock',
                input: ({ context }) => ({ slot: context.slot }),
                onDone: {
                  target: 'checkingSlotStatus',
                  actions: assign({
                    beaconBlockData: ({ event }) => ({
                      rawData: event.output,
                      withdrawalRewards: [],
                      clDeposits: [],
                      clVoluntaryExits: [],
                      elDeposits: [],
                      elWithdrawals: [],
                      elConsolidations: [],
                    }),
                  }),
                },
              },
            },
            checkingSlotStatus: {
              always: [
                {
                  guard: 'isSlotMissed',
                  target: 'markingSlotCompleted',
                },
                'processing',
              ],
            },
            processing: {
              description: 'Processing all beacon slot data',
              type: 'parallel',
              onDone: 'complete',
              states: {
                withdrawalRewards: {
                  description: 'Processing withdrawal rewards from beacon block',
                  invoke: {
                    src: 'processWithdrawalsRewardsData',
                    input: ({ context }) => {
                      const _beaconBlockData = context.beaconBlockData?.rawData as Block;
                      const withdrawals =
                        _beaconBlockData?.data?.message?.body?.execution_payload?.withdrawals || [];

                      return {
                        slot: context.slot,
                        withdrawals: withdrawals,
                      };
                    },
                    onDone: {
                      actions: assign({
                        beaconBlockData: ({ context, event }) => ({
                          ...context.beaconBlockData!,
                          withdrawalRewards: event.output || [],
                        }),
                      }),
                    },
                  },
                },
                clDeposits: {
                  description: 'Processing CL deposits from beacon block',
                  invoke: {
                    src: 'processClDeposits',
                    input: ({ context }) => {
                      const _beaconBlockData = context.beaconBlockData?.rawData as Block;
                      return {
                        slot: context.slot,
                        deposits: _beaconBlockData?.data?.message?.body?.deposits || [],
                      };
                    },
                    onDone: {
                      actions: assign({
                        beaconBlockData: ({ context, event }) => ({
                          ...context.beaconBlockData!,
                          clDeposits: event.output || [],
                        }),
                      }),
                    },
                  },
                },
                clVoluntaryExits: {
                  description: 'Processing CL voluntary exits from beacon block',
                  invoke: {
                    src: 'processClVoluntaryExits',
                    input: ({ context }) => {
                      const _beaconBlockData = context.beaconBlockData?.rawData as Block;
                      return {
                        slot: context.slot,
                        voluntaryExits:
                          _beaconBlockData?.data?.message?.body?.voluntary_exits || [],
                      };
                    },
                    onDone: {
                      actions: assign({
                        beaconBlockData: ({ context, event }) => ({
                          ...context.beaconBlockData!,
                          clVoluntaryExits: event.output || [],
                        }),
                      }),
                    },
                  },
                },
                elDeposits: {
                  description: 'Processing EL deposits from execution payload',
                  invoke: {
                    src: 'processElDeposits',
                    input: ({ context }) => {
                      const _beaconBlockData = context.beaconBlockData?.rawData as Block;
                      return {
                        slot: context.slot,
                        executionPayload: _beaconBlockData?.data?.message?.body?.execution_payload,
                      };
                    },
                    onDone: {
                      actions: assign({
                        beaconBlockData: ({ context, event }) => ({
                          ...context.beaconBlockData!,
                          elDeposits: event.output || [],
                        }),
                      }),
                    },
                  },
                },
                elWithdrawals: {
                  description: 'Processing EL withdrawals from execution payload',
                  invoke: {
                    src: 'processElWithdrawals',
                    input: ({ context }) => {
                      const _beaconBlockData = context.beaconBlockData?.rawData as Block;
                      return {
                        slot: context.slot,
                        withdrawals:
                          _beaconBlockData?.data?.message?.body?.execution_payload?.withdrawals ||
                          [],
                      };
                    },
                    onDone: {
                      actions: assign({
                        beaconBlockData: ({ context, event }) => ({
                          ...context.beaconBlockData!,
                          elWithdrawals: event.output || [],
                        }),
                      }),
                    },
                  },
                },
                elConsolidations: {
                  description: 'Processing EL consolidations from execution payload',
                  invoke: {
                    src: 'processElConsolidations',
                    input: ({ context }) => {
                      const _beaconBlockData = context.beaconBlockData?.rawData as Block;
                      return {
                        slot: context.slot,
                        executionPayload: _beaconBlockData?.data?.message?.body?.execution_payload,
                      };
                    },
                    onDone: {
                      actions: assign({
                        beaconBlockData: ({ context, event }) => ({
                          ...context.beaconBlockData!,
                          elConsolidations: event.output || [],
                        }),
                      }),
                    },
                  },
                },
              },
            },
            markingSlotCompleted: {
              description: 'Marking slot as completed when it was missed',
              invoke: {
                src: 'updateSlotProcessed',
                input: ({ context }) => ({ slot: context.slot }),
                onDone: 'complete',
                onError: 'markingSlotCompleted',
              },
            },
            complete: {
              type: 'final',
            },
          },
        },

        executionRewards: {
          description: 'Checking the rewards for the slot proposer in the execution layer.',
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
              entry: pinoLog(
                ({ context }) => `fetching execution rewards for slot ${context.slot}`,
                'SlotProcessor:executionRewards',
              ),
              invoke: {
                src: 'fetchELRewards',
                input: ({ context }) => {
                  const _beaconBlockData = context.beaconBlockData?.rawData as Block;
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
              entry: pinoLog(
                ({ context }) => `complete execution rewards for slot ${context.slot}`,
                'SlotProcessor:executionRewards',
              ),
            },
          },
        },

        // TODO: split block and sync rewards into two states
        blockAndSyncRewards: {
          description:
            'Checking the rewards for the slot proposer and the rewards for the sync committee.',
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
              entry: pinoLog(
                ({ context }) => `waiting for sync committee for slot ${context.slot}`,
                'SlotProcessor:blockAndSyncRewards',
              ),
              after: {
                [ms('1s')]: 'syncCommitteeCheck',
              },
            },

            blockAndSyncRewardsProcessing: {
              entry: pinoLog(
                ({ context }) => `fetching block and sync rewards for slot ${context.slot}`,
                'SlotProcessor:blockAndSyncRewards',
              ),
              invoke: {
                src: 'fetchBlockAndSyncRewards',
                input: ({ context }) => {
                  const _beaconBlockData = context.beaconBlockData?.rawData as Block;
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
              entry: pinoLog(
                ({ context }) => `complete block and sync rewards for slot ${context.slot}`,
                'SlotProcessor:blockAndSyncRewards',
              ),
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
                  beaconBlockData: context.beaconBlockData?.rawData as Block,
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
              entry: pinoLog(
                ({ context }) => `waiting for sync committee for slot ${context.slot}`,
                'SlotProcessor:attestations',
              ),
              after: {
                [ms('1s')]: 'gettingCommitteeValidatorsAmounts',
              },
            },
            processingAttestations: {
              entry: pinoLog(
                ({ context }) => `processing attestations for slot ${context.slot}`,
                'SlotProcessor:attestations',
              ),
              invoke: {
                src: 'processAttestations',
                input: ({ context }) => {
                  const _beaconBlockData = context.beaconBlockData?.rawData as Block;

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
              entry: pinoLog(
                ({ context }) => `updating processed flag for slot ${context.slot}`,
                'SlotProcessor:attestations',
              ),
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
              entry: pinoLog(
                ({ context }) => `complete  slot ${context.slot}`,
                'SlotProcessor:attestations',
              ),
              type: 'final',
            },
          },
        },

        //withdrawal_credentials.slice(-40)
      },
    },

    updatingSlotProcessed: {
      description: 'Updating slot processed status and beacon data in database',
      entry: pinoLog(
        ({ context }) => `Updating slot processed status for slot ${context.slot}`,
        'SlotProcessor:updatingSlotProcessed',
      ),
      invoke: {
        src: 'updateSlotWithBeaconData',
        input: ({ context }) => ({
          slot: context.slot,
          beaconBlockData: context.beaconBlockData,
        }),
        onDone: 'markingSlotCompleted',
        onError: 'updatingSlotProcessed',
      },
    },

    markingSlotCompleted: {
      description:
        "Marking the slot as completed when it was missed. This state handles slots that didn't produce a block.",
      entry: pinoLog(
        ({ context }) => `Marking slot completed ${context.slot}`,
        'SlotProcessor:markingSlotCompleted',
      ),
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
      entry: [
        sendParent({ type: 'SLOT_COMPLETED' }),
        pinoLog(({ context }) => `Completed slot ${context.slot}`, 'SlotProcessor:slotCompleted'),
      ],
      type: 'final',
    },
  },
});
