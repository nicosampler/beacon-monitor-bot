// 1 because the current slot might be in progress
// 1 to give the network time to receive the attestations
// 1 because attestations for slot n are available in slot n+1
export const SLOT_DELAY_TO_FETCH = 2;
