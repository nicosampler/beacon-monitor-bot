import { PrismaClient, Prisma } from "@prisma/client";
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

export function calculateSlotRange(startTime: Date, endTime: Date) {
  const startSlot = getSlotNumberFromTimestamp(startTime.getTime());
  const tmpEndSlot = getSlotNumberFromTimestamp(endTime.getTime());
  const endSlot = tmpEndSlot + env.BEACON_SLOTS_PER_EPOCH;
  return { startSlot, endSlot };
}

export async function isProcessingTooEarly(endSlot: number): Promise<boolean> {
  const endSlotTime = getTimestampFromSlotNumber(endSlot + 1);
  return Date.now() < endSlotTime;
}

export async function hasUnprocessedSlots(
  startSlot: number,
  endSlot: number
): Promise<boolean> {
  const unprocessedSlots = await prisma.slot.count({
    where: {
      slot: { gte: startSlot, lte: endSlot },
      attestationsFetched: false,
    },
  });
  return unprocessedSlots > 0;
}

export async function aggregateMissedAttestations(
  startSlot: number,
  endSlot: number
) {
  return prisma.committee.groupBy({
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
}
export type ValidatorMissedAttestations = Awaited<
  ReturnType<typeof aggregateMissedAttestations>
>[number];

export async function processBatchesInTransaction(
  committeeValidators: ValidatorMissedAttestations[],
  hour: number,
  date: Date,
  startSlot: number,
  endSlot: number,
  endTime: Date
) {
  await prisma.$transaction(
    async (tx) => {
      for (let i = 0; i < committeeValidators.length; i += BATCH_SIZE) {
        const batch = committeeValidators.slice(i, i + BATCH_SIZE);
        await upsertBatch(tx, batch, hour, date);
        logger.info(`Processed batch ${i / BATCH_SIZE + 1}`);
      }

      await removeProcessedCommitteeRecords(tx, startSlot, endSlot);
      await updateLastSummaryUpdate("hourlyValidatorStats", endTime, tx);
    },
    { timeout: TRANSACTION_TIMEOUT }
  );
}

async function upsertBatch(
  tx: Prisma.TransactionClient,
  batch: ValidatorMissedAttestations[],
  hour: number,
  date: Date
) {
  const values = batch
    .map(
      (stat) =>
        `(${stat.validatorIndex}, ${hour}, '${date.toISOString().split("T")[0]}', 0, 0, ${stat._count.validatorIndex})`
    )
    .join(",");

  await tx.$executeRawUnsafe(`
    INSERT INTO "HourlyValidatorStats" ("validatorIndex", "hour", "date", "executionRewards", "beaconRewards", "attestationsMissed")
    VALUES ${values}
    ON CONFLICT ("validatorIndex", "hour", "date") 
    DO UPDATE SET "attestationsMissed" = "HourlyValidatorStats"."attestationsMissed"
  `);
}

export async function removeProcessedCommitteeRecords(
  tx: Prisma.TransactionClient,
  startSlot: number,
  endSlot: number
) {
  logger.info(
    `Removing processed committee records from slot ${startSlot} to ${endSlot}`
  );
  await tx.committee.deleteMany({
    where: {
      slot: { gte: startSlot, lte: endSlot },
    },
  });
}
