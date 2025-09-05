import { setup, assign, stopChild, sendParent, ActorRefFrom } from 'xstate';

import { getEpochSlots } from '@/src/beacon/utils/misc.js';
import { env } from '@/src/env.js';
import { logActor, logRemoveMachine } from '@/src/xstate/multiMachineLogger.js';
import { findMinUnprocessedSlotInEpoch } from '@/src/xstate/slot/slot.actors.js';
import { slotProcessorMachine } from '@/src/xstate/slot/slotProcessor.machine.js';

export interface SlotOrchestratorContext {
  epoch: number;
  startSlot: number;
  endSlot: number;
  currentSlot: number | null;
  slotActor: ActorRefFrom<typeof slotProcessorMachine> | null;
}

// Extract the SLOTS_COMPLETED event type for reuse in other machines
export type SlotsCompletedEvent = { type: 'SLOTS_COMPLETED'; epoch: number };

export type SlotOrchestratorEvents =
  | SlotsCompletedEvent
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
    findMinUnprocessedSlotInEpoch,
  },
  guards: {
    hasSlotToProcess: ({ context }) => context.currentSlot !== null,
  },
  actions: {
    sendEvent_slotsCompleted: sendParent(({ context }) => ({
      type: 'SLOTS_COMPLETED',
      epoch: context.epoch,
    })),
    spawn_slotProcessor: assign({
      slotActor: ({ context, spawn }) => {
        const slotId = `slotProcessor:${context.epoch}:${context.currentSlot}`;

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
    log_removeMachine: ({ context }) => {
      logRemoveMachine(context.slotActor?.id || '', 'SLOT_COMPLETED');
    },
    stop_stopSlotProcessor: stopChild(({ context }) => context.slotActor?.id || ''),
    assign_resetActorAndIncrementSlot: assign({
      slotActor: null,
      currentSlot: ({ context }) => context.currentSlot! + 1,
    }),
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
        src: 'findMinUnprocessedSlotInEpoch',
        input: ({ context }) => ({
          startSlot: context.startSlot,
          endSlot: context.endSlot,
        }),
        onDone: {
          target: 'checkingSlotToProcess',
          actions: assign({
            currentSlot: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'initializing',
        },
      },
    },

    checkingSlotToProcess: {
      always: [
        {
          guard: 'hasSlotToProcess',
          target: 'spawningSlotProcessor',
        },
        {
          target: 'allSlotsComplete',
        },
      ],
    },

    spawningSlotProcessor: {
      entry: 'spawn_slotProcessor',
      on: {
        SLOT_COMPLETED: {
          target: 'slotComplete',
          actions: [
            'log_removeMachine',
            'stop_stopSlotProcessor',
            'assign_resetActorAndIncrementSlot',
          ],
        },
      },
    },

    slotComplete: {
      always: [
        {
          guard: 'hasSlotToProcess',
          target: 'spawningSlotProcessor',
        },
        {
          target: 'allSlotsComplete',
        },
      ],
    },

    allSlotsComplete: {
      entry: 'sendEvent_slotsCompleted',
      type: 'final',
    },
  },
});
