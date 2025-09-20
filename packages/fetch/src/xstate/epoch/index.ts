import { createActor } from 'xstate';

import { env } from '@/src/lib/env.js';
import { epochCreationMachine } from '@/src/xstate/epoch/epochCreator.machine.js';
import { epochOrchestratorMachine } from '@/src/xstate/epoch/epochOrchestrator.machine.js';
import { epochProcessorMachine } from '@/src/xstate/epoch/epochProcessor.machine.js';
import { logMachine } from '@/src/xstate/multiMachineLogger.js';

export const Epoch = epochCreationMachine;
export const ProcessEpoch = epochProcessorMachine;
export const EpochOrchestrator = epochOrchestratorMachine;

export const getCreateEpochActor = () => {
  const actor = createActor(Epoch, {
    input: {
      slotDuration: env.BEACON_SLOT_DURATION_IN_SECONDS,
    },
  });

  actor.subscribe((snapshot) => {
    const { context } = snapshot;

    logMachine('epochCreator', `State: ${JSON.stringify(snapshot.value)}`, {
      // Current state info
      lastEpoch: context.lastEpoch,
      epochsToCreate: context.epochsToCreate,
      // Simple status
      hasEpochsToCreate: context.epochsToCreate.length > 0,
    });
  });

  return actor;
};

export const getEpochOrchestratorActor = () => {
  const actor = createActor(EpochOrchestrator, {
    input: {
      slotDuration: env.BEACON_SLOT_DURATION_IN_SECONDS,
      lookbackSlot: env.BEACON_LOOKBACK_SLOT,
    },
  });

  actor.subscribe((snapshot) => {
    const { context } = snapshot;

    // Get information about the current epoch actor if it exists
    const epochActorInfo = context.epochActor
      ? {
          state: context.epochActor.getSnapshot().value,
          epochData: context.epochData,
        }
      : null;

    logMachine('epochOrchestrator', `State: ${JSON.stringify(snapshot.value)}`, {
      // Current epoch being processed
      currentEpoch: context.epochData?.epoch || null,
      // Active epoch processor if any
      spawnedEpochProcessor: epochActorInfo,
    });
  });

  return actor;
};
