import { env } from "@/src/env.js";
import { getLastSlotWithAttestations_db } from "@/src/prisma/slot.js";
import { getEpochFromSlot } from "@/src/utils/misc.js";
import { getSlotNumberFromTimestamp } from "@/src/utils/time.js";
import { de } from "date-fns/locale";

export async function getSlotInfo() {
  const currentSlot = getSlotNumberFromTimestamp(new Date().getTime());
  // give some time to index the last slot
  const headSlot = currentSlot - env.BEACON_DELAY_SLOTS_TO_HEAD;
  // We need some magic number to give the bot some time for any potential delays
  // NOTE: when syncing, the bot won't inform some stats.
  // BEACON_MAX_ATTESTATION_DELAY should be a value relatively reasonable and pretty close to the head.
  const maxSlotToQuery = headSlot - env.BEACON_MAX_ATTESTATION_DELAY;
  const lastSlotProcessed = await getLastSlotWithAttestations_db();

  // The bot is syncing if the last slot processed is less than
  // one complete epoch behind the head epoch
  const syncing = lastSlotProcessed.slot < maxSlotToQuery;

  return {
    headSlot,
    maxSlotToQuery,
    maxEpochToQuery: getEpochFromSlot(maxSlotToQuery),
    delay: currentSlot - lastSlotProcessed.slot,
    syncing,
  };
}
