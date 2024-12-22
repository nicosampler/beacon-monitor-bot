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
      ) - 10; // 10 is some buffer just to be safe
      logger.info(`Deleting slots lower than ${maxSlot}`);

      if (maxSlot) {
        const result = await prisma.$executeRaw`
          DELETE FROM "Committee" 
          WHERE slot < ${maxSlot}`;
        totalDeleted += result;
      }
    }

    logger.info(`Done! Deleted ${totalDeleted} records`);
  } catch (error) {
    logger.error(`Error cleaning up committee: ${error}`, error);
  }
}
