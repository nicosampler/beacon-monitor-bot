import ms from 'ms';
import { setup, assign } from 'xstate';

import { env } from '@/src/env.js';
import {
  getLastCreatedEpochOrNull,
  computeNextEpochBatch,
  enqueueEpochs,
} from '@/src/xstate/epoch/createEpoch.actors.js';

export const epochCreationMachine = setup({
  types: {
    context: {} as {
      lastEpoch: number | null;
      epochsToCreate: number[];
    },
  },
  actors: {
    getLastCreatedEpochOrNull,
    computeNextEpochBatch,
    enqueueEpochs,
  },
}).createMachine({
  id: 'EpochCreation',
  initial: 'poll',
  context: {
    lastEpoch: 0,
    epochsToCreate: [],
  },
  states: {
    poll: { always: 'initialize' },
    initialize: {
      // Ensure context is properly initialized with default values
      entry: assign({
        lastEpoch: 0,
        epochsToCreate: [],
      }),
      always: 'readLastCreated',
    },
    readLastCreated: {
      invoke: {
        src: 'getLastCreatedEpochOrNull',
        onDone: {
          target: 'getEpochsToCreate',
          actions: assign({ lastEpoch: ({ event }) => event.output }),
        },
        onError: 'sleep',
      },
    },
    getEpochsToCreate: {
      invoke: {
        src: 'computeNextEpochBatch',
        input: ({ context }) => ({ lastEpoch: context.lastEpoch }),
        onDone: {
          target: 'createEpochs',
          actions: assign({ epochsToCreate: ({ event }) => event.output }),
        },
        onError: 'sleep',
      },
    },
    createEpochs: {
      invoke: {
        src: enqueueEpochs,
        input: ({ context }) => ({ epochsToCreate: context.epochsToCreate }),
        onDone: 'sleep',
        onError: 'sleep',
      },
    },
    sleep: {
      after: {
        [ms(`${env.BEACON_SLOTS_PER_EPOCH * env.BEACON_SLOT_DURATION_IN_SECONDS}s`)]: 'poll',
      },
    },
  },
});
