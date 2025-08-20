import { createActor } from 'xstate';

import { addMachineLog } from '@/src/lib/multiMachineLogger.js';
import { epochCreationMachine } from '@/src/xstate/epoch/createEpoch.machine.js';
import { epochOrchestratorMachine } from '@/src/xstate/epoch/epochOrchestrator.machine.js';
import { processEpochMachine } from '@/src/xstate/epoch/processEpoch.machine.js';

export const Epoch = epochCreationMachine;
export const ProcessEpoch = processEpochMachine;
export const EpochOrchestrator = epochOrchestratorMachine;

export const getCreateEpochActor = () => {
  const actor = createActor(Epoch);

  actor.subscribe((snapshot) => {
    addMachineLog('EpochCreator', `State: ${JSON.stringify(snapshot.value)}`, {
      context: snapshot.context,
    });
  });

  return actor;
};

export const getProcessEpochActor = () => {
  const actor = createActor(ProcessEpoch);

  actor.subscribe((snapshot) => {
    addMachineLog('EpochProcessor', `State: ${JSON.stringify(snapshot.value)}`, {
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

    const activeEpochs = Array.from(epochs.values()).filter((instance) => instance !== undefined);
    const queuedEpochs = Array.from(epochs.entries())
      .filter(([_, instance]) => instance === undefined)
      .map(([epochNumber, _]) => epochNumber);

    addMachineLog('EpochOrchestrator', `State: ${JSON.stringify(snapshot.value)}`, {
      maxConcurrentEpochs,
      totalEpochs: epochs.size,
      activeEpochs: activeEpochs.length,
      queuedEpochs: queuedEpochs.length,
      activeEpochNumbers: Array.from(epochs.entries())
        .filter(([_, instance]) => instance !== undefined)
        .map(([epochNumber, _]) => epochNumber),
      queuedEpochNumbers: queuedEpochs,
    });
  });

  return actor;
};
