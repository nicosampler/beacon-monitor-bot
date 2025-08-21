import ms from 'ms';
import { setup, assign, stopChild, ActorRefFrom } from 'xstate';

import { getEpochsToProcess, type EpochToProcess } from './epochOrchestrator.actors.js';
import { epochProcessorMachine } from './epochProcessor.machine.js';

import { getEpochSlots } from '@/src/beacon/utils/misc.js';

export interface EpochEntry {
  data: EpochToProcess;
  actorRef: ActorRefFrom<typeof epochProcessorMachine> | undefined;
}

export interface EpochOrchestratorContext {
  maxConcurrentEpochs: number;
  epochs: Map<number, EpochEntry>; // Map of epochNumber -> {data, actorRef}
}

export type EpochOrchestratorEvents =
  | { type: 'NEW_EPOCHS_IN_QUEUE' }
  | { type: 'EPOCH_COMPLETED'; machineId: string }
  | { type: 'EPOCH_QUEUE_SLOT_RELEASED' };

/**
 * @fileoverview The epoch orchestrator is a state machine that is responsible for orchestrating the processing of epochs.
 *
 * It is responsible for:
 * - Fetching epochs to process
 * - Spawning the epoch machines
 * - Monitoring the epoch machines
 *
 * We need to allow multiple parallel processing of epochs for two main reasons:
 * - It's possible to fetch committees for future epochs
 * - It's possible to fetch sync committees for future epochs (which allow us to notify the operator)
 * - If we are away from the head, it will help to catch up faster
 */

export const epochOrchestratorMachine = setup({
  types: {} as {
    context: EpochOrchestratorContext;
    events: EpochOrchestratorEvents;
  },
  actors: {
    getEpochsToProcess,
    epochProcessor: epochProcessorMachine,
  },
}).createMachine({
  id: 'EpochOrchestrator',
  initial: 'orchestrating',
  context: {
    maxConcurrentEpochs: 1,
    epochs: new Map<number, EpochEntry>(),
  },
  states: {
    orchestrating: {
      type: 'parallel',
      states: {
        epochFeeder: {
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
                    guard: ({ event, context }) =>
                      event.output.length > 0 && context.epochs.size < context.maxConcurrentEpochs,
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
              on: {
                EPOCH_QUEUE_SLOT_RELEASED: {
                  target: 'loadingEpochs',
                  reenter: true,
                },
              },
            },
            awaitingCompletion: {
              on: {
                EPOCH_QUEUE_SLOT_RELEASED: 'loadingEpochs',
              },
            },
            retryPending: {
              after: {
                [ms('5s')]: 'loadingEpochs',
              },
              on: { EPOCH_QUEUE_SLOT_RELEASED: 'loadingEpochs' },
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
                            const epochId = `epochProcessor:${epochNumber}`;
                            const { startSlot, endSlot } = getEpochSlots(epochNumber);
                            const epochData = epochEntry.data;

                            // Spawn the epoch machine with real state from DB
                            const epochActorRef = spawn('epochProcessor', {
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

                        // Extract epoch number from machineId (format: "epochProcessor:123456")
                        const epochNumber = parseInt(event.machineId.split(':')[1]);

                        // Remove the epoch completely from the map
                        newEpochs.delete(epochNumber);

                        return newEpochs;
                      },
                    }),
                    ({ self }) => self.send({ type: 'EPOCH_QUEUE_SLOT_RELEASED' }),
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
