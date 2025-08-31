import { getCreateEpochActor, getEpochOrchestratorActor } from '@/src/xstate/epoch/index.js';

export default function initXstateMachines() {
  getCreateEpochActor().start();
  getEpochOrchestratorActor().start();
}
