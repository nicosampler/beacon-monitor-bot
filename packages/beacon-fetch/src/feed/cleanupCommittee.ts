import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { CustomLogger } from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";

const prisma = getPrisma();

export async function cleanupCommittee(logger: CustomLogger) {
  logger.info("Cleaning up committee...");
  let totalDeleted = 0;

  try {
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
