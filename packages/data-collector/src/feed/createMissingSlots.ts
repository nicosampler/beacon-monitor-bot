import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { SLOT_DELAY_TO_FETCH } from "@/src/constants/index.js";
import { env } from "@/src/env.js";
import createLogger from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { subDays } from "date-fns/subDays";
import _ from "lodash";

const prisma = getPrisma();

/**
 * Initialize slots in the database
 * This function check if the needed slots from the oldestLookbackSlot to the currentSlot are in the database.
 * If it finds a missing slot, it will add it to the database.
 * */
export default async function createMissingSlots() {
  const logger = createLogger("createDBMissingSlots");

  try {
    const now = new Date();
    const subDaysDate = subDays(now, env.BEACON_LOOKBACK_DAYS);
    // subtract 1 because the last slot is being processed in another task
    const currentSlot =
      getSlotNumberFromTimestamp(now.getTime()) - SLOT_DELAY_TO_FETCH - 1;
    const oldestLookbackSlot = getSlotNumberFromTimestamp(
      subDaysDate.getTime()
    );

    // get all the slots between the oldestLookbackSlot and the currentSlot
    const allSlotsInRange = Array.from(
      { length: currentSlot - oldestLookbackSlot + 1 },
      (_, i) => oldestLookbackSlot + i
    );

    logger.info(`Checking ${allSlotsInRange.length} slots.`);

    const batchSize = 10000;

    let totalInserted = 0;

    await prisma.$transaction(async (tx) => {
      // First, get all existing slots in the range
      const existingSlots = await tx.slot.findMany({
        where: {
          slot: {
            gte: oldestLookbackSlot,
            lte: currentSlot,
          },
        },
        select: { slot: true },
      });

      const existingSlotSet = new Set(existingSlots.map((s) => s.slot));

      // Filter out existing slots
      const slotsToInsert = allSlotsInRange.filter(
        (slot) => !existingSlotSet.has(slot)
      );

      logger.info(`Found ${slotsToInsert.length} slots to insert.`);

      // Insert missing slots in batches
      for (const batch of _.chunk(slotsToInsert, batchSize)) {
        await tx.slot.createMany({
          data: batch.map((slot) => ({ slot, attestationsFetched: false })),
          skipDuplicates: true,
        });
        totalInserted += batch.length;
        logger.info(
          `Inserted batch of ${batch.length} slots. Total: ${totalInserted}`
        );
      }
    });

    logger.info(`Insertion complete. Total slots inserted: ${totalInserted}`);
  } catch (error) {
    logger.error("Error.", { error });
    throw error;
  }
}
