import { env } from "@/src/env.js";
import { getLastSlotWithAttestations_db } from "@/src/prisma/slot.js";
import { getEpochFromSlot } from "@/src/utils/misc.js";
import { getSlotNumberFromTimestamp } from "@/src/utils/time.js";

export async function getSlotInfo() {
  const currentSlot = getSlotNumberFromTimestamp(new Date().getTime());
  const headSlot = currentSlot - env.BEACON_DELAY_SLOTS_TO_HEAD;
  const maxSlotToQuery = headSlot - env.BEACON_SLOTS_PER_EPOCH;
  const lastSlotProcessed = await getLastSlotWithAttestations_db();

  // The bot is syncing if the last slot processed is less than
  // one complete epoch behind the head epoch
  const syncing = lastSlotProcessed.slot < maxSlotToQuery;

  return {
    headSlot,
    maxSlotToQuery,
    maxEpochToQuery: getEpochFromSlot(maxSlotToQuery),
    syncing,
  };
}
