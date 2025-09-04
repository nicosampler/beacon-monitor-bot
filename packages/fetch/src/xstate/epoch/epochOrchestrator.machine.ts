import ms from 'ms';
import { setup, assign, stopChild, ActorRefFrom, log } from 'xstate';

import { getMinEpochToProcess, type EpochToProcess } from './epoch.actors.js';
import { epochProcessorMachine } from './epochProcessor.machine.js';

import { env } from '@/src/env.js';
import type { CustomLogger } from '@/src/lib/pino.js';
import { logMachine, logActor } from '@/src/xstate/multiMachineLogger.js';
import { pinoLog } from '@/src/xstate/pinoLog.js';

export interface EpochOrchestratorContext {
  epochData: EpochToProcess | null;
  epochActor: ActorRefFrom<typeof epochProcessorMachine> | null;
  logger?: CustomLogger;
}

export type EpochOrchestratorEvents = { type: 'EPOCH_COMPLETED'; machineId: string };

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
              pinoLog(
                ({ event }) => `Start processing epoch ${event.output?.epoch}`,
                'EpochOrchestrator',
              ),
            ],
          },
          {
            target: 'noEpochsToProcess',
          },
        ],
        onError: [
          {
            target: 'retryGettingEpoch',
            actions: pinoLog(
              ({ event }) => `Error getting min epoch to process: ${event.error}`,
              'EpochOrchestrator',
              'error',
            ),
          },
        ],
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
        pinoLog(
          ({ context }) => `Spawning epoch processor for epoch ${context.epochData?.epoch}`,
          'EpochOrchestrator',
        ),
      ],
      on: {
        EPOCH_COMPLETED: {
          target: 'gettingMinEpoch',
          actions: [
            pinoLog(
              ({ event }) => `Epoch processing completed for epoch ${event.machineId}`,
              'EpochOrchestrator',
            ),
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
      entry: pinoLog(`Retrying getting min epoch to process`, 'EpochOrchestrator'),
      after: {
        [ms('1s')]: 'gettingMinEpoch',
      },
    },

    noEpochsToProcess: {
      entry: pinoLog('No epochs to process, waiting for next check', 'EpochOrchestrator'),
      after: {
        [ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS}s`)]: 'gettingMinEpoch',
      },
    },
  },
});
