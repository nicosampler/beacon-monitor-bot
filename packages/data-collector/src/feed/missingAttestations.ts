import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { SLOT_DELAY_TO_FETCH } from "@/src/constants/index.js";
import { env } from "@/src/env.js";
// import createMissingSlots from "@/src/feed/createMissingSlots.js";
import { subDays } from "date-fns/subDays";
import { getPrisma } from "@/src/lib/prisma.js";
import { pullAttestations } from "@/src/feed/attestations.js";
import createLogger from "@/src/lib/pino.js";
import { db_getUnprocessedSlots } from "@/src/feed/utils.js";

const prisma = getPrisma();

export const pullMissingAttestations = async () => {
  const logger = createLogger("pullMissingAttestations");
  logger.info(`Pulling MISSING attestations`);

  // pull missing slots
  //await createMissingSlots();

  // get oldest unprocessed slots
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
    orderConfig: {
      direction: "last",
      limit: 1,
    },
  });

  if (!slots.length) {
    logger.info(`No missing slots`);
    return;
  }

  logger.info(`Fetching slot ${slots[0]}`);

  pullAttestations(slots[0]).catch();
};
