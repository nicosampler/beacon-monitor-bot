import { setup, assign, stopChild, sendParent, ActorRefFrom } from 'xstate';

import { getEpochSlots } from '@/src/beacon/utils/misc.js';
import { env } from '@/src/env.js';
import { logMachine, logActor, logRemoveMachine } from '@/src/xstate/multiMachineLogger.js';
import { findNextUnprocessedSlot } from '@/src/xstate/slot/slot.actors.js';
import { slotProcessorMachine } from '@/src/xstate/slot/slotProcessor.machine.js';

export interface SlotOrchestratorContext {
  epoch: number;
  startSlot: number;
  endSlot: number;
  currentSlot: number | null;
  slotActor: ActorRefFrom<typeof slotProcessorMachine> | null;
}

export type SlotOrchestratorEvents =
  | { type: 'SLOTS_COMPLETED'; epoch: number }
  | { type: 'SLOT_COMPLETED' }
  | { type: 'NEXT_SLOT_FOUND'; nextSlot: number };

export interface SlotOrchestratorInput {
  epoch: number;
}

/**
 * @fileoverview The slot orchestrator is a state machine that is responsible for orchestrating the processing of slots within an epoch.
 *
 * It is responsible for:
 * - Getting all slots for the epoch
 * - Finding the next unprocessed slot
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
    findNextUnprocessedSlot,
  },
}).createMachine({
  id: 'SlotOrchestrator',
  initial: 'initializing',
  context: ({ input }) => {
    const { startSlot: _startSlot, endSlot } = getEpochSlots(input.epoch);
    const startSlot = Math.max(_startSlot, env.BEACON_LOOKBACK_SLOT);

    return {
      epoch: input.epoch,
      startSlot,
      endSlot,
      currentSlot: null,
      slotActor: null,
    };
  },
  states: {
    initializing: {
      invoke: {
        src: 'findNextUnprocessedSlot',
        input: ({ context }) => ({
          startSlot: context.startSlot,
          endSlot: context.endSlot,
        }),
        onDone: {
          target: 'checkingSlots',
          actions: assign({
            currentSlot: ({ event, context }) =>
              event.output == null ? context.endSlot : event.output,
          }),
        },
        onError: {
          target: 'initializing',
        },
      },
    },

    checkingSlots: {
      always: [
        {
          guard: ({ context }) => context.currentSlot! <= context.endSlot,
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
          const slotId = `slotProcessor:${context.epoch}:${context.currentSlot}`;

          // Register the spawned slot processor machine
          logMachine(slotId, 'Spawning', { epoch: context.epoch, slot: context.currentSlot });

          const actor = spawn('slotProcessor', {
            id: slotId,
            input: {
              epoch: context.epoch,
              slot: context.currentSlot!,
            },
          });

          // Automatically log the actor's state and context
          logActor(actor, slotId);

          return actor;
        },
      }),
      on: {
        SLOT_COMPLETED: {
          target: 'slotComplete',
          actions: [
            ({ context }) => {
              if (context.slotActor) {
                logRemoveMachine(context.slotActor.id, 'SLOT_COMPLETED');
              }
            },
            stopChild(({ context }) => context.slotActor?.id || ''),
            assign({
              slotActor: null,
              currentSlot: ({ context }) => context.currentSlot! + 1,
            }),
          ],
        },
      },
    },

    slotComplete: {
      always: [
        {
          guard: ({ context }) => context.currentSlot! <= context.endSlot,
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
