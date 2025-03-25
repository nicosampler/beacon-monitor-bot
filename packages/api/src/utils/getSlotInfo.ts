import { env } from '@/src/env.js';
import { getLastSlotWithAttestations_db } from '@/src/services/prisma/getLastSlotWithAttestations.js';
import { getSlotNumberFromTimestamp } from '@/src/utils/beacon.js';

export async function getSlotInfo() {
  const lastSlotWithAttestations = await getLastSlotWithAttestations_db();
  const lastSlotProcessed = lastSlotWithAttestations?.slot || 0;

  // This should be equal to lastSlotProcessed, if lastSlotProcessed is behind
  // it means that the indexer is delayed.
  const headSlot = getSlotNumberFromTimestamp(new Date().getTime());

  // attestations for slot n come at slot n + 1
  const slotNComesAtNPlusOne = 1;
  const indexerIdealHead = headSlot - slotNComesAtNPlusOne - env.BEACON_DELAY_SLOTS_TO_HEAD;

  // A validator can safely attest to a slot up to env.BEACON_MAX_ATTESTATION_DELAY slots after.
  // is the attestation comes after it, is considered missed.
  const maxSafeSlotToQuery = lastSlotProcessed - env.BEACON_MAX_ATTESTATION_DELAY;

  // is syncing if the indexer is 1 epoch behind
  const syncing = lastSlotProcessed < indexerIdealHead - env.BEACON_SLOTS_PER_EPOCH;

  return {
    lastSlotProcessed,
    syncing,
    delay: indexerIdealHead - lastSlotProcessed,
    maxSafeSlotToQuery,
  };
}
