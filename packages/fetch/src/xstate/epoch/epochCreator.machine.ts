import { setup, assign } from 'xstate';

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
      slotDuration: number;
    },
    input: {} as {
      slotDuration: number;
    },
  },
  actors: {
    getLastCreatedEpoch,
    getEpochsToCreate,
    enqueueEpochs,
  },
  delays: {
    slotDuration: ({ context }) => {
      return context.slotDuration * 1000;
    },
  },
}).createMachine({
  id: 'EpochCreator',
  initial: 'readLastCreated',
  description: 'The epoch creator is a state machine that is responsible for creating epochs.',
  context: ({ input }) => ({
    lastEpoch: 0,
    epochsToCreate: [],
    slotDuration: input.slotDuration,
  }),
  states: {
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
        slotDuration: {
          target: 'readLastCreated',
          actions: assign({
            lastEpoch: 0,
            epochsToCreate: [],
          }),
        },
      },
    },
  },
});
