import ms from 'ms';
import { setup, assign, sendParent, stopChild } from 'xstate';

import { getEpochSlots } from '@/src/beacon/utils/misc.js';
import { getSlotNumberFromTimestamp } from '@/src/beacon/utils/time.js';
import { env } from '@/src/env.js';
import {
  canProcessEpoch,
  validatorsNotFetched,
  canFetchCommittees,
  canFetchSyncCommittees,
  rewardsNotFetched,
  canProcessRewards,
  isFirstEpochOfSyncCommitteePeriod,
  isLookbackEpoch,
  fetchValidators,
  fetchCommittees,
  fetchSyncCommittees,
  checkIfCanGetValidators,
  checkSyncCommitteeStatus,
} from '@/src/xstate/epoch/epochProcessor.actors.js';
import { ProcessEpochContext, ProcessEpochSetup } from '@/src/xstate/epoch/epochProcessor.types.js';
import { slotProcessorMachine } from '@/src/xstate/slot/slotProcessor.machine.js';

export const epochProcessorMachine = setup({
  types: {} as ProcessEpochSetup,
  actors: {
    fetchValidators,
    fetchCommittees,
    fetchSyncCommittees,
    checkIfCanGetValidators,
    checkSyncCommitteeStatus,
    slotProcessor: slotProcessorMachine,
  },
  guards: {
    canProcessEpoch,
    validatorsNotFetched,
    canFetchCommittees,
    canFetchSyncCommittees,
    rewardsNotFetched,
    canProcessRewards,
    isFirstEpochOfSyncCommitteePeriod,
    isLookbackEpoch,
  },
}).createMachine({
  id: 'EpochProcessor',
  initial: 'epochValidation',
  context: ({ input }) => {
    const { startSlot, endSlot } = getEpochSlots(input.epoch);
    return {
      epoch: input.epoch,
      startSlot: startSlot,
      endSlot: endSlot,
      validatorsInfoFetched: input.validatorsInfoFetched,
      rewardsFetched: input.rewardsFetched,
      committeesFetched: input.committeesFetched,
      slotsFetched: input.slotsFetched,
      syncCommitteesFetched: input.syncCommitteesFetched ?? false,
      slotActor: null,
      currentSlot: getSlotNumberFromTimestamp(Date.now()),
    } satisfies ProcessEpochContext;
  },
  states: {
    /**
     * Check if we can start processing the epoch
     * We can process some data up to current epoch + 1.
     */
    epochValidation: {
      always: [
        {
          guard: 'canProcessEpoch',
          target: 'mainProcessing',
        },
        {
          target: 'epochWaiting',
        },
      ],
    },
    epochWaiting: {
      after: {
        [ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS / 2}s`)]: 'epochValidation',
      },
    },

    mainProcessing: {
      type: 'parallel',
      states: {
        epochProcessing: {
          type: 'parallel',
          states: {
            /**
             * Get epoch committees
             */
            committees: {
              initial: 'committeeFetchCheck',
              states: {
                committeeStatusCheck: {
                  always: [
                    {
                      guard: ({ context }) => !context.committeesFetched,
                      target: 'committeeFetching',
                    },
                    {
                      target: 'committeeComplete',
                      actions: [sendParent({ type: 'COMMITTEES_READY' })],
                    },
                  ],
                },
                committeeFetching: {
                  invoke: {
                    src: 'fetchCommittees',
                    input: ({ context }) => ({ epoch: context.epoch }),
                    onDone: [
                      {
                        actions: assign({
                          committeesFetched: true,
                        }),
                        target: 'committeeComplete',
                      },
                    ],
                    onError: 'committeeFetching',
                  },
                },
                committeeComplete: {
                  type: 'final',
                  entry: [sendParent({ type: 'COMMITTEES_READY' })],
                },
              },
            },

            /**
             * Get sync committees
             * Sync committees persist across multiple epochs, we fetch them only for the first epoch of the sync committee period
             */
            syncCommittees: {
              initial: 'syncCommitteeFetchCheck',
              states: {
                syncCommitteeStatusCheck: {
                  always: [
                    {
                      guard: ({ context }) => !context.syncCommitteesFetched,
                      target: 'syncCommitteeTypeCheck',
                    },
                    {
                      target: 'syncCommitteeComplete',
                    },
                  ],
                },
                syncCommitteeTypeCheck: {
                  always: [
                    {
                      guard: 'isFirstEpochOfSyncCommitteePeriod',
                      target: 'syncCommitteeFetching',
                    },
                    {
                      guard: 'isLookbackEpoch',
                      target: 'syncCommitteeFetching',
                    },
                    {
                      target: 'syncCommitteeComplete',
                    },
                  ],
                },
                syncCommitteeFetching: {
                  invoke: {
                    src: 'fetchSyncCommittees',
                    input: ({ context }) => ({ epoch: context.epoch }),
                    onDone: [
                      {
                        actions: assign({
                          syncCommitteesFetched: true,
                        }),
                        target: 'syncCommitteeComplete',
                      },
                    ],
                    onError: 'syncCommitteeFetching',
                  },
                },
                syncCommitteeComplete: { type: 'final' },
              },
            },

            /**
             * Get all active beacon validators
             * We need to know the validators to calculate missed rewards
             */
            validators: {
              initial: 'validatorStatusCheck',
              states: {
                validatorStatusCheck: {
                  always: [
                    {
                      guard: 'validatorsNotFetched',
                      target: 'validatorTimingCheck',
                    },
                    {
                      target: 'validatorComplete',
                    },
                  ],
                },
                validatorTimingCheck: {
                  invoke: {
                    src: 'checkIfCanGetValidators',
                    input: ({ context }) => context.startSlot,
                    onDone: [
                      {
                        guard: ({ event }) => event.output.canProceed,
                        target: 'validatorFetching',
                      },
                      {
                        target: 'validatorWaiting',
                      },
                    ],
                    onError: 'validatorWaiting',
                  },
                },
                validatorWaiting: {
                  after: {
                    [ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS / 2}s`)]: 'validatorTimingCheck',
                  },
                },
                validatorFetching: {
                  invoke: {
                    src: 'fetchValidators',
                    input: ({ context }) => ({ startSlot: context.startSlot }),
                    onDone: [
                      {
                        actions: assign({
                          validatorsInfoFetched: true,
                        }),
                        target: 'validatorComplete',
                      },
                    ],
                    onError: 'validatorComplete',
                  },
                },
                validatorComplete: { type: 'final' },
              },
            },

            /**
             * Rewards processing track
             * Rewards can only be processed when:
             * 1. Validators have been fetched for the current epoch
             * 2. Current slot is greater than the epoch's end slot
             */
            rewards: {
              initial: 'rewardStatusCheck',
              states: {
                rewardStatusCheck: {
                  always: [
                    {
                      guard: 'canProcessRewards',
                      target: 'rewardProcessing',
                    },
                    {
                      target: 'rewardWaiting',
                    },
                  ],
                },
                rewardWaiting: {
                  after: {
                    [ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS / 2}s`)]: 'rewardStatusCheck', // Check conditions again after 10 seconds
                  },
                },
                rewardProcessing: {
                  // Placeholder for actual rewards processing logic
                  after: {
                    [ms('1s')]: 'rewardComplete',
                  },
                },
                rewardComplete: { type: 'final' },
              },
            },
          },
        },

        /**
         * Process slots for the epoch
         * This state waits for committees to be ready before processing slots
         */
        slotsProcessing: {
          initial: 'slotIdle',
          states: {
            slotIdle: {
              on: {
                COMMITTEES_READY: 'slotSpawning',
              },
            },
            slotSpawning: {
              entry: assign({
                slotActor: ({ context, spawn }) => {
                  const slotId = `slotProcessor:${context.epoch}`;
                  return spawn('slotProcessor', {
                    id: slotId,
                    input: {
                      epoch: context.epoch,
                    },
                  });
                },
              }),
              on: {
                SLOT_COMPLETED: {
                  target: 'slotComplete',
                  actions: [
                    stopChild(({ context }) => context.slotActor?.id || ''),
                    assign({
                      slotsFetched: true,
                      slotActor: null,
                    }),
                  ],
                },
              },
            },
            slotComplete: {
              type: 'final',
            },
          },
        },
      },
      onDone: 'epochComplete',
    },

    epochComplete: {
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
