import ms from 'ms';
import { setup, assign } from 'xstate';
import {
  getLastCreatedEpochOrNull,
  computeNextEpochBatch,
  enqueueEpochs,
} from '@/src/xstate/epoch/creation.actors.js';
import { env } from '@/src/env.js';

export const epochCreationMachine = setup({
  types: {
    context: {} as {
      lastEpoch: number;
      epochsToCreate: number[];
    },
  },
  actors: {
    'db.getLastCreatedEpochOrNull': getLastCreatedEpochOrNull,
    computeNextEpochBatch: computeNextEpochBatch,
    'db.enqueueEpochs': enqueueEpochs,
  },
}).createMachine({
  id: 'EpochCreation',
  initial: 'poll',
  context: {
    lastEpoch: 0,
    epochsToCreate: [],
  },
  states: {
    poll: { always: 'readLastCreated' },
    readLastCreated: {
      invoke: {
        src: 'db.getLastCreatedEpochOrNull',
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
        src: 'db.enqueueEpochs',
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
