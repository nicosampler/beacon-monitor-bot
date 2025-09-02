import ms from 'ms';
import { setup, assign, sendParent, stopChild, raise, ActorRefFrom } from 'xstate';

import { slotOrchestratorMachine, SlotsCompletedEvent } from '../slot/slotOrchestrator.machine.js';

import { getEpochSlots } from '@/src/beacon/utils/misc.js';
import { getSlotNumberFromTimestamp } from '@/src/beacon/utils/time.js';
import { env } from '@/src/env.js';
import {
  fetchAttestationsRewards,
  fetchValidatorsBalances,
  fetchCommittees,
  fetchSyncCommittees,
  checkIfCanFetchValidatorsBalances,
  checkSyncCommitteeStatus,
  updateSlotsFetched,
  checkSlotsProcessed,
} from '@/src/xstate/epoch/epoch.actors.js';
import {
  canProcessEpoch,
  canFetchCommittees,
  canFetchSyncCommittees,
  canProcessRewards,
  isFirstEpochOfSyncCommitteePeriod,
  isLookbackEpoch,
} from '@/src/xstate/epoch/epoch.guards.js';
import { logMachine, logActor } from '@/src/xstate/multiMachineLogger.js';

type ProcessEpochContext = {
  epoch: number;
  startSlot: number;
  endSlot: number;
  epochDBSnapshot: {
    validatorsBalancesFetched: boolean;
    rewardsFetched: boolean;
    committeesFetched: boolean;
    slotsFetched: boolean;
    syncCommitteesFetched: boolean;
  };
  slotOrchestratorActor?: ActorRefFrom<typeof slotOrchestratorMachine> | null;
  currentSlot?: number;
};

type ProcessEpochEvents =
  | {
      type: 'COMMITTEES_FETCHED';
    }
  | {
      type: 'VALIDATORS_BALANCES_FETCHED';
    }
  | SlotsCompletedEvent;

export const epochProcessorMachine = setup({
  types: {} as {
    context: ProcessEpochContext;
    events: ProcessEpochEvents;
    input: {
      epoch: number;
      currentSlot?: number;
      validatorsBalancesFetched: boolean;
      rewardsFetched: boolean;
      committeesFetched: boolean;
      slotsFetched: boolean;
      syncCommitteesFetched: boolean;
    };
  },
  actors: {
    fetchValidatorsBalances,
    fetchAttestationsRewards,
    fetchCommittees,
    fetchSyncCommittees,
    checkIfCanFetchValidatorsBalances,
    checkSyncCommitteeStatus,
    slotOrchestratorMachine,
    updateSlotsFetched,
    checkSlotsProcessed,
  },
  guards: {
    canProcessEpoch,
    canFetchCommittees,
    canFetchSyncCommittees,
    canProcessRewards,
    isFirstEpochOfSyncCommitteePeriod,
    isLookbackEpoch,
  },
}).createMachine({
  id: 'EpochProcessor',
  initial: 'checkingCanProcess',
  context: ({ input }) => {
    const { startSlot, endSlot } = getEpochSlots(input.epoch);
    return {
      epoch: input.epoch,
      startSlot: startSlot,
      endSlot: endSlot,
      epochDBSnapshot: {
        // read-only statuses
        validatorsBalancesFetched: input.validatorsBalancesFetched,
        rewardsFetched: input.rewardsFetched,
        committeesFetched: input.committeesFetched,
        slotsFetched: input.slotsFetched,
        syncCommitteesFetched: input.syncCommitteesFetched,
      },
      slotOrchestratorActor: null,
      currentSlot: getSlotNumberFromTimestamp(Date.now()),
    } satisfies ProcessEpochContext;
  },
  states: {
    /**
     * Check if we can start processing the epoch
     * We can process some data up to current epoch + 1.
     */
    checkingCanProcess: {
      always: [
        {
          guard: 'canProcessEpoch',
          target: 'epochProcessing',
        },
        {
          target: 'waiting',
        },
      ],
    },
    waiting: {
      after: {
        [ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS / 2}s`)]: 'checkingCanProcess',
      },
    },

    epochProcessing: {
      type: 'parallel',
      states: {
        fetching: {
          type: 'parallel',
          states: {
            /**
             * Get epoch committees
             */
            committees: {
              initial: 'checkingEpochStatus',
              states: {
                checkingEpochStatus: {
                  always: [
                    {
                      guard: ({ context }) => !context.epochDBSnapshot.committeesFetched,
                      target: 'fetching',
                    },
                    {
                      target: 'complete',
                    },
                  ],
                },
                fetching: {
                  invoke: {
                    src: 'fetchCommittees',
                    input: ({ context }) => ({ epoch: context.epoch }),
                    onDone: [
                      {
                        target: 'complete',
                      },
                    ],
                    onError: 'fetching',
                  },
                },
                complete: {
                  type: 'final',
                  entry: raise({ type: 'COMMITTEES_FETCHED' }),
                },
              },
            },

            /**
             * Process slots for the epoch
             * This state waits for committees to be ready before starting
             */
            slotsProcessing: {
              initial: 'waitingForCommittees',
              states: {
                waitingForCommittees: {
                  on: {
                    COMMITTEES_FETCHED: 'checkingSlotsProcessed',
                  },
                },
                checkingSlotsProcessed: {
                  invoke: {
                    src: 'checkSlotsProcessed',
                    input: ({ context }) => ({ epoch: context.epoch }),
                    onDone: [
                      {
                        guard: ({ event }) => event.output.slotsProcessed,
                        target: 'complete',
                      },
                      {
                        target: 'processingSlots',
                      },
                    ],
                    onError: 'checkingSlotsProcessed',
                  },
                },
                processingSlots: {
                  entry: assign({
                    slotOrchestratorActor: ({ context, spawn }) => {
                      const orchestratorId = `slotOrchestrator:${context.epoch}`;
                      // Register the spawned slot orchestrator machine
                      logMachine(orchestratorId, 'Spawning', { epoch: context.epoch });

                      const actor = spawn('slotOrchestratorMachine', {
                        id: orchestratorId,
                        input: {
                          epoch: context.epoch,
                        },
                      });

                      // Automatically log the actor's state and context
                      logActor(actor, orchestratorId);

                      return actor;
                    },
                  }),
                  on: {
                    SLOTS_COMPLETED: {
                      target: 'updateSlotsFetched',
                      actions: [
                        stopChild(({ context }) => context.slotOrchestratorActor?.id || ''),
                        assign({
                          slotOrchestratorActor: null,
                        }),
                      ],
                    },
                  },
                },
                updateSlotsFetched: {
                  invoke: {
                    src: 'updateSlotsFetched',
                    input: ({ context }) => ({ epoch: context.epoch }),
                    onDone: {
                      target: 'complete',
                    },
                    onError: {
                      target: 'updateSlotsFetched',
                    },
                  },
                },
                complete: {
                  type: 'final',
                },
              },
            },

            /**
             * Get sync committees
             * Sync committees persist across multiple epochs, we fetch them only for the first epoch of the sync committee period
             */
            syncingCommittees: {
              initial: 'checkingEpochStatus',
              states: {
                checkingEpochStatus: {
                  always: [
                    {
                      guard: ({ context }) => context.epochDBSnapshot.syncCommitteesFetched,
                      target: 'complete',
                    },
                    {
                      target: 'checkingInDBTable',
                    },
                  ],
                },
                checkingInDBTable: {
                  invoke: {
                    src: 'checkSyncCommitteeStatus',
                    input: ({ context }) => ({ epoch: context.epoch }),
                    onDone: [
                      {
                        guard: ({ event }) => event.output.isFetched,
                        target: 'complete',
                      },
                      {
                        target: 'fetching',
                      },
                    ],
                    onError: 'checkingInDBTable',
                  },
                },
                fetching: {
                  invoke: {
                    src: 'fetchSyncCommittees',
                    input: ({ context }) => ({ epoch: context.epoch }),
                    onDone: [
                      {
                        target: 'complete',
                      },
                    ],
                    onError: 'fetching',
                  },
                },
                complete: { type: 'final' },
              },
            },

            //TODO: fetch validators pending of activation
            // make fetchValidators receive statuses to fetch.
            // trackingTransitioningValidators: {
            // }

            /**
             * Get all active beacon validators balances
             * We need to know the validators balances to calculate missed rewards
             */
            validatorsBalances: {
              initial: 'checkingStatus',
              states: {
                checkingStatus: {
                  always: [
                    {
                      guard: ({ context }) => context.epochDBSnapshot.validatorsBalancesFetched,
                      target: 'complete',
                    },
                    {
                      target: 'waitingForSlotToStart',
                    },
                  ],
                },
                waitingForSlotToStart: {
                  invoke: {
                    src: 'checkIfCanFetchValidatorsBalances',
                    input: ({ context }) => ({ slot: context.startSlot }),
                    onDone: [
                      {
                        guard: ({ event }) => event.output.canProceed,
                        target: 'fetching',
                      },
                      {
                        target: 'waitingForSlotToStartDelaying',
                      },
                    ],
                  },
                },
                waitingForSlotToStartDelaying: {
                  after: {
                    [ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS / 2}s`)]: 'waitingForSlotToStart',
                  },
                },
                fetching: {
                  invoke: {
                    src: 'fetchValidatorsBalances',
                    input: ({ context }) => ({ startSlot: context.startSlot }),
                    onDone: [
                      {
                        target: 'complete',
                      },
                    ],
                    onError: 'fetching',
                  },
                },
                complete: {
                  entry: raise({ type: 'VALIDATORS_BALANCES_FETCHED' }),
                  type: 'final',
                },
              },
            },

            /**
             * Rewards processing track
             * Rewards can only be processed when:
             * 1. Validators have been fetched for the current epoch
             * 2. Current slot is greater than the epoch's end slot
             */
            rewards: {
              initial: 'waitingForValidatorsBalances',
              states: {
                waitingForValidatorsBalances: {
                  on: {
                    VALIDATORS_BALANCES_FETCHED: 'checkingCanProcess',
                  },
                },
                checkingCanProcess: {
                  always: [
                    {
                      guard: 'canProcessRewards',
                      target: 'processing',
                    },
                    {
                      target: 'delayingCanProcess',
                    },
                  ],
                },
                delayingCanProcess: {
                  after: {
                    [ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS / 2}s`)]: 'checkingCanProcess',
                  },
                },
                fetching: {
                  invoke: {
                    src: 'fetchAttestationsRewards',
                    input: ({ context }) => ({ epoch: context.epoch }),
                    onDone: [
                      {
                        target: 'complete',
                      },
                    ],
                    onError: 'fetching',
                  },
                },
                complete: { type: 'final' },
              },
            },
          },
        },
      },
      onDone: 'complete',
    },

    complete: {
      entry: [
        sendParent(({ context }) => ({
          type: 'EPOCH_COMPLETED',
          machineId: `epochProcessor:${context.epoch}`,
        })),
      ],
      type: 'final',
    },
  },
});
