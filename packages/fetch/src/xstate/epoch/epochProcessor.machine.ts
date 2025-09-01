import ms from 'ms';
import { setup, assign, sendParent, stopChild, raise, ActorRef } from 'xstate';

import { slotOrchestratorMachine, SlotsCompletedEvent } from '../slot/slotOrchestrator.machine.js';

import { getEpochSlots } from '@/src/beacon/utils/misc.js';
import { getSlotNumberFromTimestamp } from '@/src/beacon/utils/time.js';
import { env } from '@/src/env.js';
import {
  fetchValidators,
  fetchCommittees,
  fetchSyncCommittees,
  checkIfCanGetValidators,
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
  epochDBStatus: {
    validatorsInfoFetched: boolean;
    rewardsFetched: boolean;
    committeesFetched: boolean;
    slotsFetched: boolean;
    syncCommitteesFetched: boolean;
  };
  slotOrchestratorActor?: ActorRef<any, any> | null;
  currentSlot?: number; // Add currentSlot to track current slot number
};

type ProcessEpochEvents =
  | {
      type: 'COMMITTEES_FETCHED';
    }
  | SlotsCompletedEvent;

export const epochProcessorMachine = setup({
  types: {} as {
    context: ProcessEpochContext;
    events: ProcessEpochEvents;
    input: {
      epoch: number;
      validatorsInfoFetched: boolean;
      rewardsFetched: boolean;
      committeesFetched: boolean;
      slotsFetched: boolean;
      syncCommitteesFetched: boolean;
      currentSlot?: number; // Add currentSlot to input type
    };
  },
  actors: {
    fetchValidators,
    fetchCommittees,
    fetchSyncCommittees,
    checkIfCanGetValidators,
    checkSyncCommitteeStatus,
    slotOrchestratorMachine,
    updateSlotsFetched,
    checkSlotsProcessed,
  },
  guards: {
    canProcessEpoch,
    //validatorsNotFetched,
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
      // read-only statuses
      epochDBStatus: {
        validatorsInfoFetched: input.validatorsInfoFetched,
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
                      guard: ({ context }) => !context.epochDBStatus.committeesFetched,
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
            syncCommittees: {
              initial: 'checkingEpochStatus',
              states: {
                checkingEpochStatus: {
                  always: [
                    {
                      guard: ({ context }) => context.epochDBStatus.syncCommitteesFetched,
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

            /**
             * Get all active beacon validators
             * We need to know the validators to calculate missed rewards
             */
            // validators: {
            //   initial: 'validatorStatusCheck',
            //   states: {
            //     validatorStatusCheck: {
            //       always: [
            //         {
            //           guard: 'validatorsNotFetched',
            //           target: 'validatorTimingCheck',
            //         },
            //         {
            //           target: 'validatorComplete',
            //         },
            //       ],
            //     },
            //     validatorTimingCheck: {
            //       invoke: {
            //         src: 'checkIfCanGetValidators',
            //         input: ({ context }) => context.startSlot,
            //         onDone: [
            //           {
            //             guard: ({ event }) => event.output.canProceed,
            //             target: 'validatorFetching',
            //           },
            //           {
            //             target: 'validatorWaiting',
            //           },
            //         ],
            //         onError: 'validatorWaiting',
            //       },
            //     },
            //     validatorWaiting: {
            //       after: {
            //         [ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS / 2}s`)]: 'validatorTimingCheck',
            //       },
            //     },
            //     validatorFetching: {
            //       invoke: {
            //         src: 'fetchValidators',
            //         input: ({ context }) => ({ startSlot: context.startSlot }),
            //         onDone: [
            //           {
            //             actions: assign({
            //               validatorsInfoFetched: true,
            //             }),
            //             target: 'validatorComplete',
            //           },
            //         ],
            //         onError: 'validatorComplete',
            //       },
            //     },
            //     validatorComplete: { type: 'final' },
            //   },
            // },

            /**
             * Rewards processing track
             * Rewards can only be processed when:
             * 1. Validators have been fetched for the current epoch
             * 2. Current slot is greater than the epoch's end slot
             */
            rewards: {
              initial: 'checkingCanProcess',
              states: {
                checkingCanProcess: {
                  always: [
                    {
                      guard: 'canProcessRewards',
                      target: 'processing',
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
                processing: {
                  // Placeholder for actual rewards processing logic
                  after: {
                    [ms('1s')]: 'complete',
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
