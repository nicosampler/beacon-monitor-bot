import { getCreateEpochActor, getEpochOrchestratorActor } from '@/src/xstate/epoch/index.js';

export default function initXstateMachines() {
  getCreateEpochActor().start();
  getEpochOrchestratorActor().start();

  // committeeCleanup: {
  //   invoke: {
  //     src: 'cleanupOldCommittees',
  //     input: ({ context }) => ({
  //       slot: context.slot,
  //     }),
  //     onDone: {
  //       target: 'complete',
  //       actions: assign({}),
  //     },
  //     onError: {
  //       target: 'committeeCleanup',
  //     },
  //   },
  // },
}
