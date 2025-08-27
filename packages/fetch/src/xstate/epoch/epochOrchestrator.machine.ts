import ms from 'ms';
import { setup, assign, stopChild, ActorRefFrom } from 'xstate';

import { getMinEpochToProcess, type EpochToProcess } from './epochOrchestrator.actors.js';
import { epochProcessorMachine } from './epochProcessor.machine.js';

import { env } from '@/src/env.js';

export interface EpochOrchestratorContext {
  epochData: EpochToProcess | null;
  epochActor: ActorRefFrom<typeof epochProcessorMachine> | null;
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
            actions: assign({
              epochData: ({ event }) => event.output,
            }),
          },
          {
            target: 'noEpochsToProcess',
          },
        ],
        onError: 'retryGettingEpoch',
      },
    },

    spawningEpochProcessor: {
      entry: assign({
        epochActor: ({ context, spawn }) => {
          if (!context.epochData) return null;

          const { epoch } = context.epochData;
          const epochId = `epochProcessor:${epoch}`;

          return spawn('epochProcessor', {
            id: epochId,
            input: {
              epoch,
              validatorsInfoFetched: context.epochData.validatorsInfoFetched,
              rewardsFetched: context.epochData.rewardsFetched,
              committeesFetched: context.epochData.committeesFetched,
              slotsFetched: context.epochData.slotsFetched,
              syncCommitteesFetched: context.epochData.syncCommitteesFetched,
            },
          });
        },
      }),
      on: {
        EPOCH_COMPLETED: {
          target: 'gettingMinEpoch',
          actions: [
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
      after: {
        [ms('1s')]: 'gettingMinEpoch',
      },
    },

    noEpochsToProcess: {
      after: {
        [ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS}s`)]: 'gettingMinEpoch',
      },
    },
  },
});
