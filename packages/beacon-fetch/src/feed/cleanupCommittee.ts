import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { env } from "@/src/env.js";
import { CustomLogger } from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";

const prisma = getPrisma();

export async function cleanupCommittee(logger: CustomLogger) {
  logger.info("Cleaning up committee...");
  let totalDeleted = 0;

  try {
    // Get the max processed slot
    const maxProcessedSlot = await prisma.slot.findFirst({
      where: { attestationsFetched: true },
      orderBy: { slot: "desc" },
      select: { slot: true },
    });

    if (maxProcessedSlot) {
      // Delete attestations that were attested in time
      const result1 = await prisma.$executeRaw`
      DELETE FROM "Committee" 
      WHERE slot <= ${maxProcessedSlot.slot} 
      AND "attestationDelay" <= ${env.BEACON_MAX_ATTESTATION_DELAY}`;
      totalDeleted += result1;
    }

    // remove attestations that were summarized in the hourly summary
    const lsu = await prisma.lastSummaryUpdate.findFirst();
    if (lsu.hourlyValidatorStats) {
      const maxSlot = getSlotNumberFromTimestamp(
        lsu.hourlyValidatorStats.getTime()
      );

      if (maxSlot) {
        const result2 = await prisma.$executeRaw`
          DELETE FROM "Committee" 
          WHERE slot < ${maxSlot}`;
        totalDeleted += result2;
      }
    }

    logger.info(`Done! Deleted ${totalDeleted} records`);
  } catch (error) {
    logger.error(`Error cleaning up committee: ${error}`, error);
  }
}
