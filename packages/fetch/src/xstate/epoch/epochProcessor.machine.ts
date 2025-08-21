import ms from 'ms';
import { setup, assign, sendParent, fromPromise } from 'xstate';

import { env } from '@/src/env.js';
import {
  canProcessEpoch,
  validatorsNotFetched,
  committeesNotFetched,
  canFetchCommittees,
  canFetchSyncCommittees,
  rewardsNotFetched,
  isFirstEpochOfSyncCommitteePeriod,
  isLookbackEpoch,
  fetchValidators,
  fetchCommittees,
  fetchSyncCommittees,
  checkIfCanGetValidators,
  checkSyncCommitteeStatus,
} from '@/src/xstate/epoch/epochProcessor.actors.js';
import { ProcessEpochContext, ProcessEpochSetup } from '@/src/xstate/epoch/epochProcessor.types.js';

export const epochProcessorMachine = setup({
  types: {} as ProcessEpochSetup,
  actors: {
    fetchValidators,
    fetchCommittees,
    fetchSyncCommittees,
    checkIfCanGetValidators,
    checkSyncCommitteeStatus,
  },
  guards: {
    canProcessEpoch,
    validatorsNotFetched,
    committeesNotFetched,
    canFetchCommittees,
    canFetchSyncCommittees,
    rewardsNotFetched,
    isFirstEpochOfSyncCommitteePeriod,
    isLookbackEpoch,
  },
}).createMachine({
  id: 'EpochProcessor',
  initial: 'checkingEpoch',
  context: ({ input }) =>
    ({
      epoch: input.epoch,
      startSlot: input.startSlot,
      endSlot: input.endSlot,
      validatorsInfoFetched: input.validatorsInfoFetched,
      rewardsFetched: input.rewardsFetched,
      committeesFetched: input.committeesFetched,
      slotsFetched: input.slotsFetched,
      syncCommitteesFetched: input.syncCommitteesFetched ?? false,
    }) satisfies ProcessEpochContext,
  states: {
    /**
     * Check if we can start processing the epoch
     * We can process up to current epoch + 1.
     */
    checkingEpoch: {
      always: [
        {
          guard: 'canProcessEpoch',
          target: 'processEpoch',
        },
        {
          target: 'waitingForEpoch',
        },
      ],
    },
    waitingForEpoch: {
      after: {
        [ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS / 2}s`)]: 'checkingEpoch',
      },
    },

    /**
     * Start processing the epoch
     */
    processEpoch: {
      type: 'parallel',
      states: {
        /**
         * Get epoch committees
         */
        track_Committees: {
          initial: 'checkCanFetchCommittees',
          states: {
            checkCanFetchCommittees: {
              always: [
                {
                  guard: 'canFetchCommittees',
                  target: 'checkIfCommitteesAlreadyFetched',
                },
                {
                  target: 'waitingForCommittees',
                },
              ],
            },
            waitingForCommittees: {
              after: {
                [ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS}s`)]: 'checkCanFetchCommittees',
              },
            },
            checkIfCommitteesAlreadyFetched: {
              always: [
                {
                  guard: 'committeesNotFetched',
                  target: 'fetchCommittees',
                },
                {
                  target: 'complete',
                },
              ],
            },
            fetchCommittees: {
              invoke: {
                src: 'fetchCommittees',
                input: ({ context }) => ({ epoch: context.epoch }),
                onDone: [
                  {
                    actions: assign({
                      committeesFetched: true,
                    }),
                    target: 'complete',
                  },
                ],
                onError: 'fetchCommittees',
              },
            },
            complete: { type: 'final' },
          },
        },

        /**
         * Get sync committees
         */
        track_SyncCommittees: {
          initial: 'checkIfSyncCommitteesAlreadyFetched',
          states: {
            checkIfSyncCommitteesAlreadyFetched: {
              always: [
                {
                  guard: ({ context }) => !context.syncCommitteesFetched,
                  target: 'checkEpochType',
                },
                {
                  target: 'complete',
                },
              ],
            },
            checkEpochType: {
              always: [
                {
                  guard: 'isFirstEpochOfSyncCommitteePeriod',
                  target: 'fetchSyncCommittees',
                },
                {
                  guard: 'isLookbackEpoch',
                  target: 'fetchSyncCommittees',
                },
                {
                  target: 'waitForSyncCommitteeFetch',
                },
              ],
            },
            waitForSyncCommitteeFetch: {
              after: {
                [ms('5s')]: 'checkIfSyncCommitteeFetched',
              },
            },
            checkIfSyncCommitteeFetched: {
              invoke: {
                src: 'checkSyncCommitteeStatus',
                input: ({ context }) => ({ epoch: context.epoch }),
                onDone: [
                  {
                    guard: ({ event }) => event.output.isFetched,
                    target: 'complete',
                  },
                  {
                    target: 'waitForSyncCommitteeFetch',
                  },
                ],
                onError: 'waitForSyncCommitteeFetch',
              },
            },
            fetchSyncCommittees: {
              invoke: {
                src: 'fetchSyncCommittees',
                input: ({ context }) => ({ epoch: context.epoch }),
                onDone: [
                  {
                    actions: assign({
                      syncCommitteesFetched: true,
                    }),
                    target: 'complete',
                  },
                ],
                onError: 'fetchSyncCommittees',
              },
            },
            complete: { type: 'final' },
          },
        },

        /**
         * Get all active beacon validators
         * We need to know the validators to calculate missed rewards
         */
        track_GetValidatorsInfo: {
          initial: 'checkIfValidatorsAlreadyFetched',
          states: {
            checkIfValidatorsAlreadyFetched: {
              always: [
                {
                  guard: 'validatorsNotFetched',
                  target: 'checkTimingAndDependencies',
                },
                {
                  target: 'complete',
                },
              ],
            },
            checkTimingAndDependencies: {
              invoke: {
                src: 'checkIfCanGetValidators',
                input: ({ context }) => context,
                onDone: [
                  {
                    guard: ({ event }) => event.output.canProceed,
                    target: 'fetchValidators',
                  },
                  {
                    target: 'waitingForTimeAndDependencies',
                  },
                ],
                onError: 'waitingForTimeAndDependencies',
              },
            },
            waitingForTimeAndDependencies: {
              after: {
                [ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS}s`)]: 'checkTimingAndDependencies',
              },
            },
            fetchValidators: {
              invoke: {
                src: 'fetchValidators',
                input: ({ context }) => ({ startSlot: context.startSlot }),
                onDone: [
                  {
                    actions: assign({
                      validatorsInfoFetched: true,
                    }),
                    target: 'complete',
                  },
                ],
                onError: 'complete',
              },
            },
            complete: { type: 'final' },
          },
        },

        /**
         * Temporary track for rewards (hack until proper implementation)
         * This track never completes to prevent the epoch from being marked as complete
         */
        track_FetchRewards: {
          initial: 'checkIfRewardsAlreadyFetched',
          states: {
            checkIfRewardsAlreadyFetched: {
              always: [
                {
                  guard: 'rewardsNotFetched',
                  target: 'waitingForRewards',
                },
                {
                  target: 'complete',
                },
              ],
            },
            waitingForRewards: {
              after: {
                [ms('10s')]: 'waitingForRewards',
              },
            },
            complete: { type: 'final' },
          },
        },
      },
      onDone: 'completeEpoch',
    },

    completeEpoch: {
      entry: [
        ({ context }) => {
          console.log(`Epoch ${context.epoch} completed processing`);
        },
        sendParent(({ context }) => ({
          type: 'EPOCH_COMPLETED',
          machineId: `epochProcessor:${context.epoch}`,
        })),
      ],
      type: 'final',
    },
  },
});
