import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { db_getOldestUnprocessedSlot } from "@/src/feed/utils.js";
import { SLOT_DELAY_TO_FETCH } from "@/src/constants/index.js";
import { env } from "@/src/env.js";
import createMissingSlots from "@/src/feed/createMissingSlots.js";
import { subDays } from "date-fns/subDays";
import { getPrisma } from "@/src/lib/prisma.js";
import { pullAttestations } from "@/src/feed/attestations.js";
import createLogger from "@/src/lib/pino.js";

const prisma = getPrisma();

export const pullMissingAttestations = async () => {
  const logger = createLogger("pullMissingAttestations");
  logger.info(`Pulling MISSING attestations`);

  // pull missing slots
  await createMissingSlots();

  // get oldest unproccessed slots
  const now = new Date();
  const currentSlot =
    getSlotNumberFromTimestamp(now.getTime()) - SLOT_DELAY_TO_FETCH - 2;
  const oldestLookbackSlot = getSlotNumberFromTimestamp(
    subDays(now, env.BEACON_LOOKBACK_DAYS).getTime()
  );
  const slots = await db_getOldestUnprocessedSlot({
    minSlot: oldestLookbackSlot,
    maxSlot: currentSlot,
    first: 1,
  });

  if (!slots.length) {
    logger.info(`No missing slots`);
    return;
  }

  logger.info(`Fetching slot ${slots[0]}`);

  pullAttestations(slots[0]).catch();
};
