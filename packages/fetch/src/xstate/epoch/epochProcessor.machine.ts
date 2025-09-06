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
  updateSyncCommitteesFetched,
  checkSlotsProcessed,
} from '@/src/xstate/epoch/epoch.actors.js';
import {
  canProcessEpoch,
  canFetchCommittees,
  canFetchSyncCommittees,
  hasEpochEnded,
  isFirstEpochOfSyncCommitteePeriod,
  isLookbackEpoch,
} from '@/src/xstate/epoch/epoch.guards.js';
import { logMachine, logActor } from '@/src/xstate/multiMachineLogger.js';
import { pinoLog } from '@/src/xstate/pinoLog.js';

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
    updateSyncCommitteesFetched,
    checkSlotsProcessed,
  },
  guards: {
    canProcessEpoch,
    canFetchCommittees,
    canFetchSyncCommittees,
    hasEpochEnded,
    isFirstEpochOfSyncCommitteePeriod,
    isLookbackEpoch,
    // Simple guards for context checks
    hasCommitteesNotFetched: ({ context }) => !context.epochDBSnapshot.committeesFetched,
    hasSlotsProcessed: ({ event }: { event: any }) => event.output?.slotsProcessed === true,
    hasSyncCommitteesFetched: ({ context }) => context.epochDBSnapshot.syncCommitteesFetched,
    isSyncCommitteeFetched: ({ event }: { event: any }) => event.output?.isFetched === true,
    hasValidatorsBalancesFetched: ({ context }) =>
      context.epochDBSnapshot.validatorsBalancesFetched,
    canProceedWithValidatorsBalances: ({ event }: { event: any }) =>
      event.output?.canProceed === true,
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
      entry: pinoLog(
        ({ context }) => `Checking if we can process the epoch, ${context.epoch}`,
        'EpochProcessor',
      ),
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
      entry: pinoLog(
        ({ context }) => `Waiting to start processing epoch ${context.epoch}`,
        'EpochProcessor',
      ),
      after: {
        [ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS / 2}s`)]: 'checkingCanProcess',
      },
    },

    epochProcessing: {
      entry: pinoLog(
        ({ context }) => `Starting epoch processing for epoch ${context.epoch}`,
        'EpochProcessor',
      ),
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
                      guard: 'hasCommitteesNotFetched',
                      target: 'fetching',
                      actions: pinoLog(
                        ({ context }) => `Fetching committees for epoch ${context.epoch}`,
                        'EpochProcessor:committees',
                      ),
                    },
                    {
                      target: 'complete',
                      actions: pinoLog(
                        ({ context }) => `Committees already fetched for epoch ${context.epoch} `,
                        'EpochProcessor:committees',
                      ),
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
                  actions: pinoLog(
                    ({ context }) => `Committees done for epoch ${context.epoch} `,
                    'EpochProcessor:committees',
                  ),
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
                  entry: pinoLog(
                    ({ context }) =>
                      `Waiting for committees to be fetched for epoch ${context.epoch} `,
                    'EpochProcessor:slotsProcessing',
                  ),
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
                        guard: 'hasSlotsProcessed',
                        target: 'complete',
                        actions: pinoLog(
                          ({ context }) => `Slots already processed for epoch ${context.epoch} `,
                          'EpochProcessor:slotsProcessing',
                        ),
                      },
                      {
                        target: 'processingSlots',
                        actions: pinoLog(
                          ({ context }) => `Processing slots for epoch ${context.epoch} `,
                          'EpochProcessor:slotsProcessing',
                        ),
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
                  entry: pinoLog(
                    ({ context }) => `Updating slots fetched for epoch ${context.epoch} `,
                    'EpochProcessor:slotsProcessing',
                  ),
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
                  entry: pinoLog(
                    ({ context }) => `Slots done for epoch ${context.epoch} `,
                    'EpochProcessor:slotsProcessing',
                  ),
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
                      guard: 'hasSyncCommitteesFetched',
                      target: 'complete',
                      actions: pinoLog(
                        ({ context }) =>
                          `Sync committees already fetched for epoch ${context.epoch} `,
                        'EpochProcessor:syncingCommittees',
                      ),
                    },
                    {
                      target: 'checkingInDBTable',
                      actions: pinoLog(
                        ({ context }) =>
                          `Checking sync committees in DB table for epoch ${context.epoch} `,
                        'EpochProcessor:syncingCommittees',
                      ),
                    },
                  ],
                },
                checkingInDBTable: {
                  invoke: {
                    src: 'checkSyncCommitteeStatus',
                    input: ({ context }) => ({ epoch: context.epoch }),
                    onDone: [
                      {
                        actions: pinoLog(
                          ({ context }) =>
                            `Sync committees found in DB table for epoch ${context.epoch} `,
                          'EpochProcessor:syncingCommittees',
                        ),
                        guard: 'isSyncCommitteeFetched',
                        target: 'updateSyncCommitteesFetched',
                      },
                      {
                        target: 'fetching',
                        actions: pinoLog(
                          ({ context }) => `Fetching sync committees for epoch ${context.epoch} `,
                          'EpochProcessor:syncingCommittees',
                        ),
                      },
                    ],
                    onError: 'checkingInDBTable',
                  },
                },
                updateSyncCommitteesFetched: {
                  invoke: {
                    src: 'updateSyncCommitteesFetched',
                    input: ({ context }) => ({ epoch: context.epoch }),
                    onDone: {
                      target: 'complete',
                    },
                    onError: {
                      target: 'updateSyncCommitteesFetched',
                    },
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
                complete: {
                  type: 'final',
                  actions: pinoLog(
                    ({ context }) => `Sync committees done for epoch ${context.epoch} `,
                    'EpochProcessor:syncingCommittees',
                  ),
                },
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
                      guard: 'hasValidatorsBalancesFetched',
                      target: 'complete',
                      actions: pinoLog(
                        ({ context }) =>
                          `Validators balances already fetched for epoch ${context.epoch} `,
                        'EpochProcessor:validatorsBalances',
                      ),
                    },
                    {
                      target: 'waitingForSlotToStart',
                      actions: pinoLog(
                        ({ context }) =>
                          `Waiting to fetch validators balances for epoch ${context.epoch} `,
                        'EpochProcessor:validatorsBalances',
                      ),
                    },
                  ],
                },
                waitingForSlotToStart: {
                  invoke: {
                    src: 'checkIfCanFetchValidatorsBalances',
                    input: ({ context }) => ({ slot: context.startSlot }),
                    onDone: [
                      {
                        guard: 'canProceedWithValidatorsBalances',
                        target: 'fetching',
                        actions: pinoLog(
                          ({ context }) =>
                            `Fetching validators balances for epoch ${context.epoch} `,
                          'EpochProcessor:validatorsBalances',
                        ),
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
                  entry: pinoLog(
                    ({ context }) => `Fetching validators balances for epoch ${context.epoch} `,
                    'EpochProcessor:validatorsBalances',
                  ),
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
                  actions: pinoLog(
                    ({ context }) => `Validators balances done for epoch ${context.epoch} `,
                    'EpochProcessor:validatorsBalances',
                  ),
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
                  actions: pinoLog(
                    ({ context }) =>
                      `Waiting for validators balances to be fetched for epoch ${context.epoch} `,
                    'EpochProcessor:rewards',
                  ),
                  on: {
                    VALIDATORS_BALANCES_FETCHED: 'waitingForEpochToEnd',
                  },
                },
                waitingForEpochToEnd: {
                  always: [
                    {
                      guard: 'hasEpochEnded',
                      target: 'fetching',
                      actions: pinoLog(
                        ({ context }) => `Fetching for epoch ${context.epoch} `,
                        'EpochProcessor:rewards',
                      ),
                    },
                    {
                      target: 'delayingCanProcess',
                    },
                  ],
                },
                delayingCanProcess: {
                  after: {
                    [ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS / 2}s`)]: 'waitingForEpochToEnd',
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
                    onError: {
                      target: 'fetching',
                      actions: ({ event }) => {
                        console.error('Error fetching attestations rewards:', event.error);
                      },
                    },
                  },
                },
                complete: {
                  type: 'final',
                  actions: pinoLog(
                    ({ context }) => `Done for epoch ${context.epoch} `,
                    'EpochProcessor:rewards',
                  ),
                },
              },
            },
          },
        },
      },
      onDone: 'complete',
    },

    complete: {
      entry: [
        pinoLog(
          ({ context }) => `Epoch processing completed for epoch ${context.epoch}`,
          'EpochProcessor',
        ),
        sendParent(({ context }) => ({
          type: 'EPOCH_COMPLETED',
          machineId: `epochProcessor:${context.epoch}`,
        })),
      ],
      type: 'final',
    },
  },
});
