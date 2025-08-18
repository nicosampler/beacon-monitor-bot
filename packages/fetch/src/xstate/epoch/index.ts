import { createActor } from 'xstate';

import { epochCreationMachine } from '@/src/xstate/epoch/createEpoch.machine.js';
import { processEpochMachine } from '@/src/xstate/epoch/processEpoch.machine.js';

export const Epoch = epochCreationMachine;

export const getCreateEpochActor = () => {
  const actor = createActor(Epoch);

  actor.subscribe((snapshot) => {
    console.log('Epoch State:', snapshot.value);
  });

  return actor;
};

export const getProcessEpochActor = () => {
  const actor = createActor(processEpochMachine);

  actor.subscribe((snapshot) => {
    console.log('Epoch Orchestrator State:', snapshot.value);
  });

  return actor;
};
