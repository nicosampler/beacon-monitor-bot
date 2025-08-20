import ms from 'ms';
import { setup, assign, stopChild, ActorRefFrom } from 'xstate';

import { getEpochsToProcess, type EpochToProcess } from './epochOrchestrator.actors.js';
import { processEpochMachine } from './processEpoch.machine.js';

import { getEpochSlots } from '@/src/beacon/utils/misc.js';
import { env } from '@/src/env.js';

export interface EpochEntry {
  data: EpochToProcess;
  actorRef: ActorRefFrom<typeof processEpochMachine> | undefined;
}

export interface EpochOrchestratorContext {
  maxConcurrentEpochs: number;
  epochs: Map<number, EpochEntry>; // Map of epochNumber -> {data, actorRef}
}

export type EpochOrchestratorEvents =
  | { type: 'NEW_EPOCHS_IN_QUEUE' }
  | { type: 'EPOCH_PROCESSED' }
  | { type: 'EPOCH_COMPLETED'; machineId: string };

export const epochOrchestratorMachine = setup({
  types: {} as {
    context: EpochOrchestratorContext;
    events: EpochOrchestratorEvents;
  },
  actors: {
    getEpochsToProcess,
    processEpoch: processEpochMachine,
  },
}).createMachine({
  id: 'EpochOrchestrator',
  initial: 'orchestrating',
  context: {
    maxConcurrentEpochs: 5,
    epochs: new Map<number, EpochEntry>(),
  },
  states: {
    orchestrating: {
      type: 'parallel',
      states: {
        epochQueue: {
          initial: 'loadingEpochs',
          states: {
            loadingEpochs: {
              invoke: {
                src: 'getEpochsToProcess',
                input: ({ context }) => ({
                  limit: Math.max(0, context.maxConcurrentEpochs - context.epochs.size),
                }),
                onDone: [
                  {
                    guard: ({ event }) => event.output.length > 0,
                    target: 'awaitingCompletion',
                    actions: [
                      assign({
                        epochs: ({ context, event }) => {
                          const epochsToProcess = event.output;
                          const newEpochs = new Map(context.epochs);

                          // Add new epochs with data and undefined actorRef (not spawned yet)
                          epochsToProcess.forEach((epochData) => {
                            if (!newEpochs.has(epochData.epoch)) {
                              newEpochs.set(epochData.epoch, {
                                data: epochData,
                                actorRef: undefined,
                              });
                            }
                          });

                          return newEpochs;
                        },
                      }),
                      ({ self }) => self.send({ type: 'NEW_EPOCHS_IN_QUEUE' }),
                    ],
                  },
                  {
                    // No epochs found, retry after delay
                    target: 'retryPending',
                  },
                ],
                onError: 'retryPending',
              },
            },
            awaitingCompletion: {
              on: {
                EPOCH_PROCESSED: 'loadingEpochs',
              },
              // if while loading epochs, EPOCH_PROCESSED where triggered and missed, we force a transition to loadingEpochs
              // This should never happen, because slots are processed in order.
              after: {
                [ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS * 5}s`)]: 'loadingEpochs',
              },
            },
            retryPending: {
              after: {
                [ms('1s')]: 'loadingEpochs',
              },
            },
          },
        },

        epochSpawner: {
          initial: 'spawningEpochs',
          states: {
            spawningEpochs: {
              on: {
                NEW_EPOCHS_IN_QUEUE: {
                  actions: [
                    assign({
                      epochs: ({ context, spawn }) => {
                        const newEpochs = new Map(context.epochs);

                        // Spawn all epochs that have undefined actorRef
                        for (const [epochNumber, epochEntry] of newEpochs.entries()) {
                          if (epochEntry.actorRef === undefined) {
                            const epochId = `processEpoch:${epochNumber}`;
                            const { startSlot, endSlot } = getEpochSlots(epochNumber);
                            const epochData = epochEntry.data;

                            // Spawn the epoch machine with real state from DB
                            const epochActorRef = spawn('processEpoch', {
                              id: epochId,
                              input: {
                                epoch: epochNumber,
                                startSlot,
                                endSlot,
                                validatorsInfoFetched: epochData.validatorsInfoFetched,
                                rewardsFetched: epochData.rewardsFetched,
                                committeesFetched: epochData.committeesFetched,
                                slotsFetched: epochData.slotsFetched,
                                syncCommitteesFetched: epochData.syncCommitteesFetched,
                              },
                            });

                            // Update the entry with the actorRef
                            newEpochs.set(epochNumber, {
                              data: epochData,
                              actorRef: epochActorRef,
                            });
                          }
                        }

                        return newEpochs;
                      },
                    }),
                  ],
                },
              },
            },
          },
        },

        epochCompletion: {
          initial: 'monitoring',
          states: {
            monitoring: {
              on: {
                EPOCH_COMPLETED: {
                  actions: [
                    stopChild(({ event }) => event.machineId),
                    assign({
                      epochs: ({ context, event }) => {
                        const newEpochs = new Map(context.epochs);

                        // Extract epoch number from machineId (format: "processEpoch:123456")
                        const epochNumber = parseInt(event.machineId.split(':')[1]);

                        // Remove the epoch completely from the map
                        newEpochs.delete(epochNumber);

                        return newEpochs;
                      },
                    }),
                    ({ self }) => self.send({ type: 'EPOCH_PROCESSED' }),
                  ],
                },
              },
            },
          },
        },
      },
    },
  },
});
