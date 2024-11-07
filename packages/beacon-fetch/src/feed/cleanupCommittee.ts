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
    // const maxProcessedSlot = await prisma.slot.findFirst({
    //   where: { attestationsFetched: true },
    //   orderBy: { slot: "desc" },
    //   select: { slot: true },
    // });

    // if (maxProcessedSlot) {
    //   // Most efficient version
    //   const result1 = await prisma.$executeRaw`
    //   WITH rows_to_delete AS (
    //     SELECT ctid
    //     FROM (
    //       SELECT ctid,
    //              row_number() OVER (ORDER BY slot) as rn
    //       FROM "Committee"
    //       WHERE slot <= ${maxProcessedSlot.slot}
    //       AND "attestationDelay" <= ${env.BEACON_MAX_ATTESTATION_DELAY}
    //     ) ranked
    //     WHERE rn <= ${LIMIT}
    //   )
    //   DELETE FROM "Committee"
    //   WHERE ctid IN (SELECT ctid FROM rows_to_delete)`;
    //   totalDeleted += result1;
    // }

    // Max summarized hourly slot
    const lsu = await prisma.lastSummaryUpdate.findFirst();
    if (lsu.hourlyValidatorStats) {
      const maxSlot = getSlotNumberFromTimestamp(
        lsu.hourlyValidatorStats.getTime()
      );

      const result2 = await prisma.$executeRaw`
        DELETE FROM "Committee"
        WHERE slot <= ${maxSlot}
        AND ctid IN (
          SELECT ctid FROM "Committee"
          WHERE slot <= ${maxSlot}
          ORDER BY slot
          LIMIT ${LIMIT}
        )`;
      totalDeleted += result2;
    }

    logger.info(`Done! Deleted ${totalDeleted} records`);
  } catch (error) {
    logger.error(`Error cleaning up committee: ${error}`, error);
  }
}
