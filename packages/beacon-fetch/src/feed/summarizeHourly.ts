import { PrismaClient, Prisma } from "@prisma/client";
import { env } from "@/src/env.js";
import {
  getSlotNumberFromTimestamp,
  getTimestampFromSlotNumber,
} from "@/src/beacon/utils/time.js";
import { updateLastSummaryUpdate } from "@/src/feed/utils.js";
import { CustomLogger } from "@/src/lib/pino.js";

const prisma = new PrismaClient();

const BATCH_SIZE = 5000;
const TRANSACTION_TIMEOUT = 120_000;

export function prepareHourlyStats(startTime: Date) {
  const hour = startTime.getUTCHours();
  const date = new Date(startTime.toISOString().split("T")[0]);
  return { hour, date };
}

export function calculateSlotRange(startTime: Date, endTime: Date) {
  const startSlot = getSlotNumberFromTimestamp(startTime.getTime());
  const tmpEndSlot = getSlotNumberFromTimestamp(endTime.getTime());
  const endSlot = tmpEndSlot + env.BEACON_SLOTS_PER_EPOCH;
  return { startSlot, endSlot };
}

export function isProcessingTooEarly(endSlot: number) {
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

export async function hasUnprocessedExecutionRewards(
  endTime: Date
): Promise<boolean> {
  // Check for the existence of any execution rewards after the endTime because:
  // 1. We will remove all the execution rewards before the endTime.
  // 3. If the table is empty, fetching restarts from env.EXECUTION_BLOCK_LOOKBACK
  const executionRewards = await prisma.executionRewards.findFirst({
    where: {
      timestamp: { gt: endTime },
    },
  });
  return executionRewards == null;
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

export async function aggregateExecutionRewards(
  startDate: Date,
  endDate: Date
) {
  return prisma.executionRewards.groupBy({
    by: ["address"],
    where: {
      timestamp: { gte: startDate, lte: endDate },
    },
    _sum: {
      amount: true,
    },
  });
}
export type ValidatorExecutionRewards = Awaited<
  ReturnType<typeof aggregateExecutionRewards>
>[number];

export async function summarizeAtomicTransaction(
  committeeValidators: ValidatorMissedAttestations[],
  executionRewards: ValidatorExecutionRewards[],
  hour: number,
  date: Date,
  startSlot: number,
  endSlot: number,
  endTime: Date,
  logger: CustomLogger
) {
  await prisma.$transaction(
    async (tx) => {
      for (let i = 0; i < committeeValidators.length; i += BATCH_SIZE) {
        const batch = committeeValidators.slice(i, i + BATCH_SIZE);
        await upsertCommitteeValidatorsBatch(tx, batch, hour, date);
      }

      for (let i = 0; i < executionRewards.length; i += BATCH_SIZE) {
        const batch = executionRewards.slice(i, i + BATCH_SIZE);
        await insertExecutionRewardsBatch(tx, batch, hour, date);
      }

      if (committeeValidators.length > 0) {
        await updateLastSummaryUpdate("hourlyValidatorStats", endTime, tx);
        await removeProcessedCommitteeRecords(tx, startSlot, endSlot, logger);
        await removeProcessedExecutionRewards(tx, endTime, logger);
      }
    },
    { timeout: TRANSACTION_TIMEOUT }
  );
}

async function upsertCommitteeValidatorsBatch(
  tx: Prisma.TransactionClient,
  batch: ValidatorMissedAttestations[],
  hour: number,
  date: Date
) {
  const values = batch
    .map(
      (stat) =>
        `(${stat.validatorIndex}, ${hour}, '${date.toISOString().split("T")[0]}', 0, ${stat._count.validatorIndex})`
    )
    .join(",");

  await tx.$executeRawUnsafe(`
    INSERT INTO "HourlyValidatorStats" ("validatorIndex", "hour", "date", "beaconRewards", "attestationsMissed")
    VALUES ${values}
    ON CONFLICT ("validatorIndex", "hour", "date") 
    DO UPDATE SET "attestationsMissed" = "HourlyValidatorStats"."attestationsMissed" + EXCLUDED."attestationsMissed"
  `);
}

export async function insertExecutionRewardsBatch(
  tx: Prisma.TransactionClient,
  batch: ValidatorExecutionRewards[],
  hour: number,
  date: Date
) {
  const values = batch
    .map(
      (stat) =>
        `('${stat.address}', ${hour}, '${date.toISOString().split("T")[0]}', ${stat._sum.amount})`
    )
    .join(",");

  await tx.$executeRawUnsafe(
    `
    INSERT INTO "HourlyExecutionRewards" ("address", "hour", "date", "amount")
    VALUES ${values}
    ON CONFLICT ("address", "hour", "date")
    DO UPDATE SET "amount" = "HourlyExecutionRewards"."amount" + EXCLUDED."amount"
    `
  );
}

export async function removeProcessedCommitteeRecords(
  tx: Prisma.TransactionClient,
  startSlot: number,
  endSlot: number,
  logger: CustomLogger
) {
  logger.info(
    `Removing processed committee records from slot ${startSlot} to ${endSlot}`
  );

  while (true) {
    // Find a batch of records to delete
    const recordsToDelete = await tx.committee.findMany({
      where: {
        slot: { gte: startSlot, lte: endSlot },
      },
      select: { slot: true, index: true, validatorIndex: true },
      take: BATCH_SIZE,
    });

    if (recordsToDelete.length === 0) {
      break; // No more records to delete
    }

    // Delete the found records
    await tx.committee.deleteMany({
      where: {
        OR: recordsToDelete.map((record) => ({
          slot: record.slot,
          index: record.index,
          validatorIndex: record.validatorIndex,
        })),
      },
    });

    if (recordsToDelete.length < BATCH_SIZE) {
      break; // This was the last batch
    }
  }
}

export async function removeProcessedExecutionRewards(
  tx: Prisma.TransactionClient,
  endTime: Date,
  logger: CustomLogger
) {
  logger.info(`Removing processed execution rewards before ${endTime}`);
  await tx.executionRewards.deleteMany({
    where: {
      timestamp: { lt: endTime },
    },
  });
}

export async function summarizeHourly(
  startTime: Date,
  endTime: Date,
  logger: CustomLogger
): Promise<void> {
  const { startSlot, endSlot } = calculateSlotRange(startTime, endTime);

  if (isProcessingTooEarly(endSlot)) {
    logger.info("Processing too early. Skipping summarization.");
    return;
  }

  if (await hasUnprocessedSlots(startSlot, endSlot)) {
    logger.info("Some slots are not fully processed. Skipping summarization.");
    return;
  }

  if (await hasUnprocessedExecutionRewards(endTime)) {
    logger.info(
      "Some execution rewards are not fully processed. Skipping summarization."
    );
    return;
  }

  logger.info(`Summarizing attestations from slot ${startSlot} to ${endSlot}`);

  // get the amount of missed attestations for each validator in the slot range
  const committeeValidators = await aggregateMissedAttestations(
    startSlot,
    endSlot
  );

  // get the amount of execution rewards for each validator in the slot range
  const executionRewards = await aggregateExecutionRewards(startTime, endTime);

  const { hour, date } = prepareHourlyStats(startTime);

  // update the hourly validator stats
  await summarizeAtomicTransaction(
    committeeValidators,
    executionRewards,
    hour,
    date,
    startSlot,
    endSlot,
    endTime,
    logger
  );

  logger.info(
    `Summarized attestations for hour ${hour} on ${date.toISOString()}`
  );
}
