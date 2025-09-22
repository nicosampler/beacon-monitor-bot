import { EpochController } from '@/src/services/consensus/controllers/epoch.js';
import { getCreateEpochActor, getEpochOrchestratorActor } from '@/src/xstate/epoch/index.js';

export default function initXstateMachines(epochController: EpochController, slotDuration: number) {
  getCreateEpochActor(epochController, slotDuration).start();

  getEpochOrchestratorActor(epochController, slotDuration).start();

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
