import { createMachine, sendParent } from 'xstate';

// export const SlotMachine = createMachine({
//   id: 'Slot',
//   types: {} as { context: { slot: number }; input: { slot: number } },
//   context: ({ input }) => ({ slot: input.slot }),
//   initial: 'committee',
//   states: {
//     committee: {
//       invoke: {
//         src: 'slot.fetchCommitteeAndUpsert',
//         onDone: 'attestations',
//         onError: 'attestations',
//       },
//     },
//     attestations: {
//       invoke: { src: 'slot.fetchAttestationsAndUpsert', onDone: 'clRewards', onError: 'clRewards' },
//     },
//     clRewards: {
//       invoke: { src: 'slot.fetchCLRewardsAndUpsert', onDone: 'elRewards', onError: 'elRewards' },
//     },
//     elRewards: {
//       invoke: { src: 'slot.fetchELRewardsAndUpsertOrSkip', onDone: 'done', onError: 'done' },
//     },
//     done: {
//       entry: sendParent(({ context }) => ({ type: 'SLOT_DONE', slot: context.slot })),
//       type: 'final',
//     },
//   },
// });
