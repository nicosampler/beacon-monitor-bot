import { Prisma } from "@prisma/client";
import { env } from "@/src/env.js";
import {
  getEpochNumberFromTimestamp,
  getSlotNumberFromTimestamp,
  getTimestampFromSlotNumber,
} from "@/src/beacon/utils/time.js";
import { updateLastSummaryUpdate } from "@/src/feed/utils.js";
import { CustomLogger } from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";
import chunk from "lodash/chunk.js";

const prisma = getPrisma();

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
  // We need at least one execution reward after the endTime because
  // We will remove all the execution rewards before the endTime and
  // if the table is empty, fetching restarts from env.EXECUTION_BLOCK_LOOKBACK
  const executionRewards = await prisma.executionRewards.findFirst({
    where: {
      timestamp: { gt: endTime },
    },
  });
  return executionRewards == null;
}

export async function hasUnprocessedBeaconRewards(
  endTime: Date
): Promise<boolean> {
  // We need at least one beacon reward epoch processed after the endTime because
  // We will remove all the beacon rewards before the endTime and
  // if the table is empty, fetching restarts from env.EXECUTION_BLOCK_LOOKBACK
  const endSlot = getEpochNumberFromTimestamp(endTime.getTime());
  const beaconRewards = await prisma.epoch.findFirst({
    where: { epoch: { gt: endSlot }, rewardsFetched: true },
  });
  return beaconRewards == null;
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

async function processCommitteeValidatorsBatch(
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

export async function processExecutionRewardsBatch(
  tx: Prisma.TransactionClient,
  executionRewards: ValidatorExecutionRewards[],
  hour: number,
  date: Date
) {
  const batches = chunk(executionRewards, 10000);

  for (const batch of batches) {
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
}

export async function removeProcessedCommitteeRecords(
  tx: Prisma.TransactionClient,
  endSlot: number,
  logger: CustomLogger
) {
  const batchSize = 5000;
  logger.info(`Removing processed committee records up to Slot ${endSlot}`);

  while (true) {
    // Find a batch of records to delete
    const recordsToDelete = await tx.committee.findMany({
      where: {
        slot: { lte: endSlot },
      },
      select: { slot: true, index: true, validatorIndex: true },
      take: batchSize,
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

    if (recordsToDelete.length < batchSize) {
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

export async function summarizeAtomicTransaction(
  committeeValidators: ValidatorMissedAttestations[],
  executionRewards: ValidatorExecutionRewards[],
  hour: number,
  date: Date,
  //startSlot: number,
  endSlot: number,
  endTime: Date,
  logger: CustomLogger
) {
  const BATCH_SIZE = 10000;

  await prisma.$transaction(
    async (tx) => {
      for (let i = 0; i < committeeValidators.length; i += BATCH_SIZE) {
        const batch = committeeValidators.slice(i, i + BATCH_SIZE);
        await processCommitteeValidatorsBatch(tx, batch, hour, date);
      }

      for (let i = 0; i < executionRewards.length; i += BATCH_SIZE) {
        const batch = executionRewards.slice(i, i + BATCH_SIZE);
        await processExecutionRewardsBatch(tx, batch, hour, date);
      }

      if (committeeValidators.length > 0) {
        await updateLastSummaryUpdate("hourlyValidatorStats", endTime, tx);
        await removeProcessedCommitteeRecords(tx, endSlot, logger);
        await removeProcessedExecutionRewards(tx, endTime, logger);
      }
    },
    { timeout: 1000 * 60 * 20 }
  );
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

  if (await hasUnprocessedBeaconRewards(endTime)) {
    logger.info(
      "Some beacon rewards are not fully processed. Skipping summarization."
    );
    return;
  }

  // Missed attestations
  const committeeValidators = await aggregateMissedAttestations(
    startSlot,
    endSlot
  );

  // Execution rewards
  const executionRewards = await aggregateExecutionRewards(startTime, endTime);

  const { hour, date } = prepareHourlyStats(startTime);

  // update the hourly validator stats
  await summarizeAtomicTransaction(
    committeeValidators,
    executionRewards,
    hour,
    date,
    endSlot,
    endTime,
    logger
  );

  logger.info(
    `Summarized attestations for hour ${hour} on ${date.toISOString()}`
  );
}
