import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { env } from "@/src/env.js";
import { CustomLogger } from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";

const prisma = getPrisma();

export async function cleanupCommittee(logger: CustomLogger) {
  logger.info("Cleaning up committee...");
  const LIMIT = 100000;
  let totalDeleted = 0;

  try {
    // Get the max processed slot
    const maxProcessedSlot = await prisma.slot.findFirst({
      where: { attestationsFetched: true },
      orderBy: { slot: "desc" },
      select: { slot: true },
    });

    if (maxProcessedSlot) {
      // Using the existing indexes (slot_relation and attestationDelay)
      // and leveraging the cascade delete relationship
      const result1 = await prisma.$executeRaw`
      DELETE FROM "Committee"
      WHERE ctid IN (
        SELECT ctid 
        FROM "Committee" c
        WHERE c.slot <= ${maxProcessedSlot.slot}
        AND c."attestationDelay" <= ${env.BEACON_MAX_ATTESTATION_DELAY}
        ORDER BY c.slot, c."attestationDelay"
        LIMIT ${LIMIT}
      )`;
      totalDeleted += result1;
    }

    // Max summarized hourly slot
    const lsu = await prisma.lastSummaryUpdate.findFirst();
    if (lsu.hourlyValidatorStats) {
      const maxSlot = getSlotNumberFromTimestamp(
        lsu.hourlyValidatorStats.getTime()
      );

      const result2 = await prisma.$executeRaw`
        DELETE FROM "Committee"
        WHERE ctid IN (
          SELECT ctid FROM "Committee"
          WHERE slot < ${maxSlot}
          LIMIT ${LIMIT}
        )`;
      totalDeleted += result2;
    }

    logger.info(`Done! Deleted ${totalDeleted} records`);
  } catch (error) {
    logger.error(`Error cleaning up committee: ${error}`, error);
  }
}
