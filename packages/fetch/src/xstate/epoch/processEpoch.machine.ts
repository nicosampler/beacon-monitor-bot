import ms from 'ms';
import { setup, assign } from 'xstate';

import { env } from '@/src/env.js';
import {
  pickNextEpoch,
  canProcessEpoch,
  hasNextEpoch,
  validatorsNotFetched,
  committeesNotFetched,
  syncCommitteesNotFetched,
  canFetchCommittees,
  canFetchSyncCommittees,
  fetchValidators,
  fetchCommittees,
  fetchSyncCommittees,
  checkIfCanGetValidators,
} from '@/src/xstate/epoch/processEpoch.actors.js';
import { ProcessEpochContext, ProcessEpochSetup } from '@/src/xstate/epoch/processEpoch.types.js';

export const processEpochMachine = setup({
  types: {} as ProcessEpochSetup,
  actors: {
    pickNextEpoch,
    fetchValidators,
    fetchCommittees,
    fetchSyncCommittees,
    checkIfCanGetValidators,
  },
  guards: {
    hasNextEpoch,
    canProcessEpoch,
    validatorsNotFetched,
    committeesNotFetched,
    syncCommitteesNotFetched,
    canFetchCommittees,
    canFetchSyncCommittees,
  },
}).createMachine({
  id: 'EpochOrchestrator',
  initial: 'pickNextEpoch',
  context: {
    epoch: 0,
    startSlot: 0,
    endSlot: 0,
    validatorsInfoFetched: false,
    rewardsFetched: false,
    committeesFetched: false,
    slotsFetched: false,
    syncCommitteesFetched: false,
  } satisfies ProcessEpochContext,
  states: {
    /**
     * Detect next epoch to process
     */

    pickNextEpoch: {
      invoke: {
        src: 'pickNextEpoch',
        onDone: [
          {
            guard: 'hasNextEpoch',
            target: 'processEpoch',
            actions: assign({
              epoch: ({ event }) => event.output!.epoch,
              startSlot: ({ event }) => event.output!.startSlot,
              endSlot: ({ event }) => event.output!.endSlot,
              validatorsInfoFetched: ({ event }) => event.output!.validatorsInfoFetched,
              rewardsFetched: ({ event }) => event.output!.rewardsFetched,
              committeesFetched: ({ event }) => event.output!.committeesFetched,
              slotsFetched: ({ event }) => event.output!.slotsFetched,
              syncCommitteesFetched: ({ event }) => event.output!.syncCommitteesFetched,
            }),
          },
          {
            target: 'idle',
          },
        ],
        onError: 'idle',
      },
    },

    idle: {
      after: { [ms('1s')]: 'pickNextEpoch' },
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
                  guard: 'syncCommitteesNotFetched',
                  target: 'checkCanFetchSyncCommittees',
                },
                {
                  target: 'complete',
                },
              ],
            },
            checkCanFetchSyncCommittees: {
              always: [
                {
                  guard: 'canFetchSyncCommittees',
                  target: 'fetchSyncCommittees',
                },
                {
                  target: 'waitingForSyncCommittees',
                },
              ],
            },
            waitingForSyncCommittees: {
              after: {
                [ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS}s`)]: 'checkCanFetchSyncCommittees',
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
              after: { [ms('1s')]: 'checkTimingAndDependencies' },
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

        // trackB_committeesSlotsAttRewards: {
        //   initial: 'fetchCommittees',
        //   states: {
        //     fetchCommittees: {
        //       invoke: {
        //         src: 'epoch.fetchCommitteesAndCreateSlots', // (3) crea los slots del epoch en DB
        //         onDone: 'processSlots',
        //         onError: 'processSlots',
        //       },
        //     },

        //     /** (5) Slot processing: una mini-orquesta que crea y espera SlotMachines */
        //     processSlots: {
        //       initial: 'spawnPool',
        //       states: {
        //         spawnPool: {
        //           invoke: {
        //             src: 'epoch.loadSlotsForEpoch', // -> { slots: number[] }
        //             onDone: {
        //           target: 'awaiting',
        //           action: assign({
        //             // Guardamos los slots y counters en contexto (pseudocódigo)
        //             slots: ({ event }) => event.output.slots,
        //             total: ({ event }) => event.output.slots.length,
        //             done: 0,
        //           }),
        //         },
        //         onError: 'awaiting', // si falla el load, igual seguimos (no ideal, pero visual)
        //       },
        //     },
        //     awaiting: {
        //       entry: 'spawnSlotChildrenIfAny', // spawnea SlotMachine por cada slot pendiente
        //       on: {
        //         SLOT_DONE: {
        //         actions: 'accumulateSlotDone',
        //         guard: ({ event }) => event.output < context.total,
        //         guard: ({ event }) => event.output < context.total,
        //         target: 'fetchAttRewards',
        //         },
        //       },
        //     },
        //     fetchAttRewards: {
        //         src: 'epoch.fetchAttestationRewards', // (4) corre cuando el último slot terminó
        //         onDone: 'complete',
        //         onError: 'complete',
        //       },
        //     },
        //     complete: { type: 'final' },
        //     complete: { type: 'final' },
        //   },
        // },

        // trackC_attestationRewards: {
      },
      onDone: 'completeEpoch',
    },

    completeEpoch: {
      entry: assign({}),
      always: 'pickNextEpoch',
    },
  },
});
