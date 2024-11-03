import { env } from "@/src/env.js";
import { CustomLogger } from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";

const prisma = getPrisma();

export async function cleanupCommittee(logger: CustomLogger) {
  logger.info("Cleaning up committee...");

  // Get the max processed slot
  const maxProcessedSlot = await prisma.slot.findFirst({
    where: { attestationsFetched: true },
    orderBy: { slot: "desc" },
    select: { slot: true },
  });

  if (!maxProcessedSlot) return;

  // Delete one batch to avoid long table locks
  // await prisma.$executeRaw`
  //   WITH rows_to_delete AS (
  //       SELECT slot FROM "Committee"
  //       WHERE slot <= ${maxProcessedSlot.slot}
  //       AND "attestationDelay" <= ${env.BEACON_MAX_ATTESTATION_DELAY}
  //       ORDER BY slot
  //       LIMIT 5000
  //   )
  //   DELETE FROM "Committee"
  //   WHERE slot IN (SELECT slot FROM rows_to_delete)`;

  logger.info(`Done!`);
}
