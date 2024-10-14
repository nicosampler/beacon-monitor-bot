import { PrismaClient } from "@prisma/client";
import { env } from "@/src/env.js";
import {
  getSlotNumberFromTimestamp,
  getTimestampFromSlotNumber,
} from "@/src/beacon/utils/time.js";
import createLogger from "@/src/lib/pino.js";
import { updateLastSummaryUpdate } from "@/src/feed/utils.js";

const prisma = new PrismaClient();
const logger = createLogger("summarizeAttestationsHourly");

const BATCH_SIZE = 5000;
const TRANSACTION_TIMEOUT = 40000;

export async function summarizeAttestationsHourly(
  startTime: Date,
  endTime: Date
): Promise<void> {
  const startSlot = getSlotNumberFromTimestamp(startTime.getTime());
  // Attestations can come up to env.BEACON_SLOTS_PER_EPOCH late.
  const tmpEndSlot = getSlotNumberFromTimestamp(endTime.getTime());
  const endSlot = tmpEndSlot + env.BEACON_SLOTS_PER_EPOCH;

  // Check if it's too early to process
  const endSlotTime = getTimestampFromSlotNumber(endSlot + 1);
  if (Date.now() < endSlotTime) {
    return;
  }

  // Verify all slots in range have attestations fetched
  const unprocessedSlots = await prisma.slot.count({
    where: {
      slot: { gte: startSlot, lte: endSlot },
      attestationsFetched: false,
    },
  });
  if (unprocessedSlots > 0) {
    logger.info("Some slots are not fully processed. Skipping summarization.");
    return;
  }

  logger.info(`Summarizing attestations from slot ${startSlot} to ${endSlot}`);

  // Aggregate missed attestations
  const committeeValidators = await prisma.committee.groupBy({
    by: ["validatorIndex"],
    where: {
      slot: { gte: startSlot, lte: endSlot },
      OR: [
        { attestationDelay: null },
        { attestationDelay: { gt: env.BEACON_MAX_ATTESTATION_DELAY } },
      ],
    },
    _count: {
      validatorIndex: true,
    },
  });

  // Prepare hourly stats
  const hour = startTime.getUTCHours();
  const date = new Date(startTime.toISOString().split("T")[0]);

  logger.info(
    `Upserting hourly validator stats for hour ${hour} on ${date.toISOString()}`
  );

  // Wrap upsert and delete operations in a single transaction
  await prisma.$transaction(
    async (tx) => {
      // Process updates in batches
      for (let i = 0; i < committeeValidators.length; i += BATCH_SIZE) {
        const batch = committeeValidators.slice(i, i + BATCH_SIZE);

        // Prepare the values for the raw query
        const values = batch
          .map(
            (stat) =>
              `(${stat.validatorIndex}, ${hour}, '${date.toISOString().split("T")[0]}', 0, 0, ${stat._count.validatorIndex})`
          )
          .join(",");

        // Perform a bulk upsert using a raw query
        await tx.$executeRawUnsafe(`
        INSERT INTO "HourlyValidatorStats" ("validatorIndex", "hour", "date", "executionRewards", "beaconRewards", "attestationsMissed")
        VALUES ${values}
        ON CONFLICT ("validatorIndex", "hour", "date") 
        DO UPDATE SET "attestationsMissed" = "HourlyValidatorStats"."attestationsMissed"
      `);

        logger.info(`Processed batch ${i / BATCH_SIZE + 1}`);
      }

      logger.info(
        `Removing processed committee records from slot ${startSlot} to ${endSlot}`
      );

      // Remove processed committee records
      await tx.committee.deleteMany({
        where: {
          slot: { gte: startSlot, lte: endSlot },
        },
      });

      // Update the LastSummaryUpdate table with the new last processed time
      await updateLastSummaryUpdate("hourlyValidatorStats", endTime, tx);
    },
    {
      timeout: TRANSACTION_TIMEOUT,
    }
  );

  logger.info(
    `Summarized attestations for hour ${hour} on ${date.toISOString()}`
  );
}
