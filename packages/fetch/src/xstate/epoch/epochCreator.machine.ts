import ms from 'ms';
import { setup, assign } from 'xstate';

import { env } from '@/src/lib/env.js';
import {
  getLastCreatedEpoch,
  getEpochsToCreate,
  enqueueEpochs,
} from '@/src/xstate/epoch/epoch.actors.js';

export const epochCreationMachine = setup({
  types: {
    context: {} as {
      lastEpoch: number | null;
      epochsToCreate: number[];
    },
  },
  actors: {
    getLastCreatedEpoch,
    getEpochsToCreate,
    enqueueEpochs,
  },
}).createMachine({
  id: 'EpochCreator',
  initial: 'initialize',
  description: 'The epoch creator is a state machine that is responsible for creating epochs.',
  context: {
    lastEpoch: 0,
    epochsToCreate: [],
  },
  states: {
    initialize: {
      entry: assign({
        lastEpoch: 0,
        epochsToCreate: [],
      }),
      always: 'readLastCreated',
    },
    readLastCreated: {
      invoke: {
        src: 'getLastCreatedEpoch',
        onDone: {
          target: 'getEpochsToCreate',
          actions: assign({ lastEpoch: ({ event }) => event.output }),
        },
        onError: 'sleep',
      },
    },
    getEpochsToCreate: {
      invoke: {
        src: 'getEpochsToCreate',
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
        src: 'enqueueEpochs',
        input: ({ context }) => ({ epochsToCreate: context.epochsToCreate }),
        onDone: 'sleep',
        onError: 'sleep',
      },
    },
    sleep: {
      after: {
        [ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS}s`)]: 'initialize',
      },
    },
  },
});
