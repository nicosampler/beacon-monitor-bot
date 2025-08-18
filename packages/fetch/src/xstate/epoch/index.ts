import { epochCreationMachine } from '@/src/xstate/epoch/creation.machine.js';
import { EpochOrchestratorMachine } from '@/src/xstate/epoch/orchestartor.machine.js';
import { createActor } from 'xstate';

export const Epoch = epochCreationMachine;

export const createEpochActor = () => {
  const createEpochActor = createActor(Epoch);

  createEpochActor.subscribe((snapshot) => {
    console.log('Epoch State:', snapshot.value);
  });

  return createEpochActor;
};

export const createEpochOrchestratorActor = () => {
  const createEpochOrchestratorActor = createActor(EpochOrchestratorMachine);

  createEpochOrchestratorActor.subscribe((snapshot) => {
    console.log('Epoch Orchestrator State:', snapshot.value);
  });

  return createEpochOrchestratorActor;
};
