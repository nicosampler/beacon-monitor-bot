import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { SLOT_DELAY_TO_FETCH } from "@/src/constants/index.js";
import { env } from "@/src/env.js";
// import createMissingSlots from "@/src/feed/createMissingSlots.js";
import { subDays } from "date-fns/subDays";
import { getPrisma } from "@/src/lib/prisma.js";
import { pullAttestations } from "@/src/feed/pullAttestations.js";
import createLogger from "@/src/lib/pino.js";
import { db_getUnprocessedSlots } from "@/src/feed/utils.js";

export const pullMissingAttestations = async () => {
  const logger = createLogger(null);

  const now = new Date();

  const currentSlot =
    getSlotNumberFromTimestamp(now.getTime()) -
    SLOT_DELAY_TO_FETCH -
    env.BEACON_SLOTS_PER_EPOCH;

  const oldestLookbackSlot = getSlotNumberFromTimestamp(
    subDays(now, env.BEACON_LOOKBACK_DAYS).getTime()
  );

  const slots = await db_getUnprocessedSlots({
    minSlot: oldestLookbackSlot,
    maxSlot: currentSlot,
    orderBy: { slot: "asc" },
    take: 1,
  });

  if (!slots.length) {
    logger.info(`No missing slots. Current head: ${currentSlot}`);
    return;
  }

  const slotToFetch = slots[0].slot;

  logger.info(
    `Pulling MISSING attestations for slot ${slotToFetch}. SlotHead: ${currentSlot} - MissingSlotsAttestations: [${oldestLookbackSlot} - ${currentSlot}]`
  );

  return pullAttestations(slotToFetch);
};
