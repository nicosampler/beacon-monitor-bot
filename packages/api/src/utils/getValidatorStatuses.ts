import { Committee, Validator } from '@prisma/client';
import _ from 'lodash';

import { env } from '@/src/env.js';
import { ValidatorStatuses } from '@/src/routes/types.js';
import {
  calculateSlotRange,
  getEpochFromSlot,
  getEpochSlots,
  VALIDATOR_STATUS,
} from '@/src/utils/beacon.js';

function areConsecutiveDescending(arr: number[]): boolean {
  return _.every(arr, (val: number, idx: number, collection: number[]): boolean => {
    if (idx === 0) return true; // First element is always valid
    return val === collection[idx - 1]! - 1;
  });
}

export function getValidatorStatuses(
  validators: Pick<Validator, 'id' | 'status'>[],
  inactiveOnMissedAttestations: number,
  userMissedAttestations: Committee[],
  maxSafeSlotToQuery: number,
): ValidatorStatuses {
  const result: ValidatorStatuses = {
    activeIds: [],
    inactiveIds: [],
    slashedIds: [],
    exitedIds: [],
  };

  const missedEpochsByValidator = new Map<number, number[]>();
  const sortedMissedAttestations = userMissedAttestations.sort((a, b) => a.slot - b.slot);
  const lastMissedAttestationByValidator = new Map<number, number>();

  // Collect missed attestations per validator
  for (const missedAttestation of sortedMissedAttestations) {
    const missedAttestationEpoch = getEpochFromSlot(missedAttestation.slot);
    const validatorId = missedAttestation.validatorIndex;

    // Skip if the attestation has time to come in
    if (missedAttestation.slot >= maxSafeSlotToQuery - env.BEACON_MAX_ATTESTATION_DELAY) {
      continue;
    }

    const missedEpochs = missedEpochsByValidator.get(validatorId) || [];

    // Collect up to inactiveOnMissedAttestations
    if (missedEpochs.length < inactiveOnMissedAttestations) {
      missedEpochs.push(missedAttestationEpoch);
      // Keep array sorted in descending order
      missedEpochs.sort((a, b) => b - a);
      missedEpochsByValidator.set(validatorId, missedEpochs);
    }

    // Store the last missed attestation for this validator
    lastMissedAttestationByValidator.set(validatorId, missedAttestation.slot);
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
    const missedEpochs = missedEpochsByValidator.get(validator.id) || [];

    if (missedEpochs.length >= inactiveOnMissedAttestations) {
      const epochsToCheck: number[] = missedEpochs.slice(0, inactiveOnMissedAttestations);

      // The last missed attestation has to be in one epoch range.
      // As all validators have to attest in one epoch range.
      const safeSlotRange = {
        end: maxSafeSlotToQuery - env.BEACON_MAX_ATTESTATION_DELAY,
        start: maxSafeSlotToQuery - env.BEACON_MAX_ATTESTATION_DELAY - 16,
      };
      const lastMissedAttestation = lastMissedAttestationByValidator.get(validator.id);
      const isLastMissedAttestationRecent =
        lastMissedAttestation &&
        lastMissedAttestation >= safeSlotRange.start &&
        lastMissedAttestation <= safeSlotRange.end;

      if (areConsecutiveDescending(epochsToCheck) && isLastMissedAttestationRecent) {
        result.inactiveIds.push(validator.id);
      }
    }

    if (!result.inactiveIds.includes(validator.id)) {
      result.activeIds.push(validator.id);
    }
  }

  return result;
}
