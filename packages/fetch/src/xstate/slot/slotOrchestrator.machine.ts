import { setup, assign, stopChild, sendParent, ActorRefFrom } from 'xstate';

import { getEpochSlots } from '@/src/beacon/utils/misc.js';
import { slotProcessorMachine } from '@/src/xstate/slot/slotProcessor.machine.js';

export interface SlotOrchestratorContext {
  epoch: number;
  startSlot: number;
  endSlot: number;
  currentSlotIndex: number;
  slotActor: ActorRefFrom<typeof slotProcessorMachine> | null;
  slotsToProcess: number[];
}

export type SlotOrchestratorEvents =
  | { type: 'SLOTS_COMPLETED'; epoch: number }
  | { type: 'slotProcessor.done' };

export interface SlotOrchestratorInput {
  epoch: number;
}

/**
 * @fileoverview The slot orchestrator is a state machine that is responsible for orchestrating the processing of slots within an epoch.
 *
 * It is responsible for:
 * - Getting all slots for the epoch
 * - Spawning slot processor machines sequentially
 * - Monitoring slot completion
 * - Moving to the next slot until all slots are processed
 *
 * This machine processes slots one at a time within an epoch.
 */

export const slotOrchestratorMachine = setup({
  types: {} as {
    context: SlotOrchestratorContext;
    events: SlotOrchestratorEvents;
    input: SlotOrchestratorInput;
  },
  actors: {
    slotProcessor: slotProcessorMachine,
  },
}).createMachine({
  id: 'SlotOrchestrator',
  initial: 'initializing',
  context: ({ input }) => {
    const { startSlot, endSlot } = getEpochSlots(input.epoch);
    const slotsToProcess = Array.from({ length: endSlot - startSlot + 1 }, (_, i) => startSlot + i);

    return {
      epoch: input.epoch,
      startSlot,
      endSlot,
      currentSlotIndex: 0,
      slotActor: null,
      slotsToProcess,
    };
  },
  states: {
    initializing: {
      always: [
        {
          guard: ({ context }) => context.slotsToProcess.length > 0,
          target: 'spawningSlotProcessor',
        },
        {
          target: 'allSlotsComplete',
        },
      ],
    },

    spawningSlotProcessor: {
      entry: assign({
        slotActor: ({ context, spawn }) => {
          const currentSlot = context.slotsToProcess[context.currentSlotIndex];
          const slotId = `slotProcessor:${context.epoch}:${currentSlot}`;

          return spawn('slotProcessor', {
            id: slotId,
            input: {
              epoch: context.epoch,
              slot: currentSlot,
            },
          });
        },
      }),
      on: {
        'slotProcessor.done': {
          target: 'slotComplete',
          actions: [
            stopChild(({ context }) => context.slotActor?.id || ''),
            assign({
              slotActor: null,
              currentSlotIndex: ({ context }) => context.currentSlotIndex + 1,
            }),
          ],
        },
      },
    },

    slotComplete: {
      always: [
        {
          guard: ({ context }) => context.currentSlotIndex < context.slotsToProcess.length,
          target: 'spawningSlotProcessor',
        },
        {
          target: 'allSlotsComplete',
        },
      ],
    },

    allSlotsComplete: {
      entry: [
        sendParent(({ context }) => ({
          type: 'SLOTS_COMPLETED',
          epoch: context.epoch,
        })),
      ],
      type: 'final',
    },
  },
});
