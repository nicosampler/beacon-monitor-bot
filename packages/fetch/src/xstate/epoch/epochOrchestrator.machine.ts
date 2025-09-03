import ms from 'ms';
import { setup, assign, stopChild, ActorRefFrom } from 'xstate';

import { getMinEpochToProcess, type EpochToProcess } from './epoch.actors.js';
import { epochProcessorMachine } from './epochProcessor.machine.js';

import { env } from '@/src/env.js';
import createLogger from '@/src/lib/pino.js';
import { logMachine, logActor } from '@/src/xstate/multiMachineLogger.js';

export interface EpochOrchestratorContext {
  epochData: EpochToProcess | null;
  epochActor: ActorRefFrom<typeof epochProcessorMachine> | null;
  logger?: ReturnType<typeof createLogger>;
}

export type EpochOrchestratorEvents = { type: 'EPOCH_COMPLETED'; machineId: string };

// Create a custom logger for epoch processing
const epochLogger = createLogger('EpochOrchestrator', true);

/**
 * @fileoverview The epoch orchestrator is a state machine that is responsible for orchestrating the processing of epochs.
 *
 * It is responsible for:
 * - Fetching the minimum unprocessed epoch
 * - Spawning the epoch processor machine
 * - Monitoring epoch completion
 *
 * This machine processes one epoch at a time.
 */

export const epochOrchestratorMachine = setup({
  types: {} as {
    context: EpochOrchestratorContext;
    events: EpochOrchestratorEvents;
  },
  actors: {
    getMinEpochToProcess,
    epochProcessor: epochProcessorMachine,
  },
}).createMachine({
  id: 'EpochOrchestrator',
  initial: 'gettingMinEpoch',
  context: {
    epochData: null,
    epochActor: null,
    logger: epochLogger,
  },
  states: {
    gettingMinEpoch: {
      invoke: {
        src: 'getMinEpochToProcess',
        onDone: [
          {
            guard: ({ event }) => event.output !== null,
            target: 'spawningEpochProcessor',
            actions: [
              assign({
                epochData: ({ event }) => event.output,
              }),
              ({ context, event }) => {
                const epoch = event.output?.epoch;
                if (epoch && context.logger) {
                  // Add epoch context to the logger for incremental logging
                  context.logger.addContext(`Epoch-${epoch}`);
                  context.logger.info('start processing epoch', { epoch });
                }
              },
            ],
          },
          {
            target: 'noEpochsToProcess',
          },
        ],
        onError: 'retryGettingEpoch',
      },
    },

    spawningEpochProcessor: {
      entry: [
        assign({
          epochActor: ({ context, spawn }) => {
            if (!context.epochData) return null;

            const { epoch } = context.epochData;
            const epochId = `epochProcessor:${epoch}`;

            // Register the spawned epoch processor machine
            logMachine(epochId, 'Spawning', { epoch });

            const actor = spawn('epochProcessor', {
              id: epochId,
              input: {
                epoch,
                validatorsBalancesFetched: context.epochData.validatorsBalancesFetched,
                rewardsFetched: context.epochData.rewardsFetched,
                committeesFetched: context.epochData.committeesFetched,
                slotsFetched: context.epochData.slotsFetched,
                syncCommitteesFetched: context.epochData.syncCommitteesFetched,
              },
            });

            logActor(actor, epochId);

            return actor;
          },
        }),
        ({ context }) => {
          const epoch = context.epochData?.epoch;
          if (epoch && context.logger) {
            context.logger.info('spawning epoch processor', {
              epoch,
              validatorsBalancesFetched: context.epochData?.validatorsBalancesFetched,
              rewardsFetched: context.epochData?.rewardsFetched,
              committeesFetched: context.epochData?.committeesFetched,
              slotsFetched: context.epochData?.slotsFetched,
              syncCommitteesFetched: context.epochData?.syncCommitteesFetched,
            });
          }
        },
      ],
      on: {
        EPOCH_COMPLETED: {
          target: 'gettingMinEpoch',
          actions: [
            ({ context, event }) => {
              const epoch = context.epochData?.epoch;
              if (epoch && context.logger) {
                context.logger.info('epoch processing completed', {
                  epoch,
                  machineId: event.machineId,
                });
              }
            },
            stopChild(({ event }) => event.machineId),
            assign({
              epochData: null,
              epochActor: null,
            }),
          ],
        },
      },
    },

    retryGettingEpoch: {
      entry: ({ context }) => {
        if (context.logger) {
          context.logger.warn('retrying to get epoch after error');
        }
      },
      after: {
        [ms('1s')]: 'gettingMinEpoch',
      },
    },

    noEpochsToProcess: {
      entry: ({ context }) => {
        if (context.logger) {
          context.logger.info('no epochs to process, waiting for next check');
        }
      },
      after: {
        [ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS}s`)]: 'gettingMinEpoch',
      },
    },
  },
});
