import { createActor } from 'xstate';

import { logMachine } from '@/src/lib/multiMachineLogger.js';
import { epochCreationMachine } from '@/src/xstate/epoch/epochCreator.machine.js';
import { epochOrchestratorMachine } from '@/src/xstate/epoch/epochOrchestrator.machine.js';
import { epochProcessorMachine } from '@/src/xstate/epoch/epochProcessor.machine.js';

export const Epoch = epochCreationMachine;
export const ProcessEpoch = epochProcessorMachine;
export const EpochOrchestrator = epochOrchestratorMachine;

export const getCreateEpochActor = () => {
  const actor = createActor(Epoch);

  actor.subscribe((snapshot) => {
    logMachine('EpochCreator', `State: ${JSON.stringify(snapshot.value)}`, {
      context: snapshot.context,
    });
  });

  return actor;
};

export const getEpochOrchestratorActor = () => {
  const actor = createActor(EpochOrchestrator);

  actor.subscribe((snapshot) => {
    const {
      context: { maxConcurrentEpochs, epochs },
    } = snapshot;

    // Filter active epochs (those with actorRef)
    const activeEpochs = Array.from(epochs.entries())
      .filter(([_, epochEntry]) => epochEntry.actorRef !== undefined)
      .map(([epochNumber, epochEntry]) => ({
        epochNumber,
        data: epochEntry.data,
        actorId: epochEntry.actorRef?.id || 'unknown',
        actorState: epochEntry.actorRef?.getSnapshot().value || 'unknown',
      }));

    // Filter queued epochs (those without actorRef)
    const queuedEpochs = Array.from(epochs.entries())
      .filter(([_, epochEntry]) => epochEntry.actorRef === undefined)
      .map(([epochNumber, epochEntry]) => ({
        epochNumber,
        data: epochEntry.data,
      }));

    logMachine('EpochOrchestrator', `State: ${JSON.stringify(snapshot.value)}`, {
      maxConcurrentEpochs,
      totalEpochs: epochs.size,
      activeEpochs: activeEpochs.length,
      queuedEpochs: queuedEpochs.length,
      // Active spawns with detailed information
      activeSpawns: activeEpochs,
      // Queued epochs waiting for spawn
      queuedSpawns: queuedEpochs,
      // Simple arrays for backward compatibility
      activeEpochNumbers: activeEpochs.map((e) => e.epochNumber),
      queuedEpochNumbers: queuedEpochs.map((e) => e.epochNumber),
    });
  });

  return actor;
};
