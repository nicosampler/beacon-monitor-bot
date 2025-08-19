import { createActor } from 'xstate';

import { addMachineLog } from '@/src/lib/multiMachineLogger.js';
import { epochCreationMachine } from '@/src/xstate/epoch/createEpoch.machine.js';
import { processEpochMachine } from '@/src/xstate/epoch/processEpoch.machine.js';

export const Epoch = epochCreationMachine;

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
  const actor = createActor(processEpochMachine);

  actor.subscribe((snapshot) => {
    addMachineLog('EpochProcessor', `State: ${JSON.stringify(snapshot.value)}`, {
      context: snapshot.context,
    });
  });

  return actor;
};
