// 1 because the current slot might be in progress

import { ValidatorStatus } from "@/src/beacon/types.js";

// 1 because attestations for slot n are available in slot n+1
export const SLOT_DELAY_TO_FETCH = 2;

// Validator status record
export const VALIDATOR_STATUS = {
  PENDING_INITIALIZED: "pending_initialized",
  PENDING_QUEUED: "pending_queued",
  ACTIVE_ONGOING: "active_ongoing",
  ACTIVE_EXITING: "active_exiting",
  ACTIVE_SLASHED: "active_slashed",
  EXITED_UNSLASHED: "exited_unslashed",
  EXITED_SLASHED: "exited_slashed",
  WITHDRAWAL_POSSIBLE: "withdrawal_possible",
  WITHDRAWAL_DONE: "withdrawal_done",
} as const satisfies Record<string, ValidatorStatus>;

// All validator statuses values
export const VALIDATOR_STATUS_VALUES = Object.values(VALIDATOR_STATUS);
