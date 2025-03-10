import { getEpochFromSlot, VALIDATOR_STATUS } from "@/src/utils/beacon.js";
import { Committee, Validator } from "@prisma/client";
import { ValidatorStatuses } from "@/src/routes/types.js";
import { env } from "@/src/env.js";
import _ from "lodash";

function areConsecutiveDescending(arr: number[]): boolean {
  return _.every(
    arr,
    (val: number, idx: number, collection: number[]): boolean => {
      if (idx === 0) return true; // First element is always valid
      return val === collection[idx - 1] - 1;
    }
  );
}

export function getValidatorStatuses(
  validators: Pick<Validator, "id" | "status">[],
  inactiveOnMissedAttestations: number,
  userMissedAttestations: Committee[],
  maxSafeSlotToQuery: number
): ValidatorStatuses {
  const result: ValidatorStatuses = {
    activeIds: [],
    inactiveIds: [],
    slashedIds: [],
    exitedIds: [],
  };

  const missedAttestationsByValidator = new Map<number, number[]>();

  // Collect missed attestations per validator
  for (const missedAttestation of userMissedAttestations) {
    const missedAttestationEpoch = getEpochFromSlot(missedAttestation.slot);
    const validatorId = missedAttestation.validatorIndex;

    // Skip if the attestation has time to come in
    if (
      missedAttestation.slot >=
      maxSafeSlotToQuery - env.BEACON_MAX_ATTESTATION_DELAY
    ) {
      continue;
    }

    const validatorMissedAttestations =
      missedAttestationsByValidator.get(validatorId) || [];

    // Collect up to inactiveOnMissedAttestations
    if (validatorMissedAttestations.length < inactiveOnMissedAttestations) {
      validatorMissedAttestations.push(missedAttestationEpoch);
      // Keep array sorted in descending order
      validatorMissedAttestations.sort((a, b) => b - a);
      missedAttestationsByValidator.set(
        validatorId,
        validatorMissedAttestations
      );
    }
  }

  // Process validators
  for (const validator of validators) {
    // Staking (Not ready yet)
    if (
      validator.status === VALIDATOR_STATUS.pending_initialized ||
      validator.status === VALIDATOR_STATUS.pending_queued
    ) {
      result.inactiveIds.push(validator.id);
      continue;
    }

    // Exited
    if (
      validator.status === VALIDATOR_STATUS.exited_unslashed ||
      validator.status === VALIDATOR_STATUS.withdrawal_possible ||
      validator.status === VALIDATOR_STATUS.withdrawal_done
    ) {
      result.exitedIds.push(validator.id);
      continue;
    }

    // Slashed
    if (
      validator.status === VALIDATOR_STATUS.active_slashed ||
      validator.status === VALIDATOR_STATUS.exited_slashed
    ) {
      result.slashedIds.push(validator.id);
      continue;
    }

    // Check missed attestations
    const missedEpochs = missedAttestationsByValidator.get(validator.id) || [];

    if (validator.id == 173389) {
      debugger;
    }

    // Check for consecutive missed epochs
    if (missedEpochs.length >= inactiveOnMissedAttestations) {
      const epochsToCheck: number[] = missedEpochs.slice(
        0,
        inactiveOnMissedAttestations
      );
      if (areConsecutiveDescending(epochsToCheck)) {
        result.inactiveIds.push(validator.id);
      }
    }

    if (!result.inactiveIds.includes(validator.id)) {
      result.activeIds.push(validator.id);
    }
  }

  return result;
}
