import { Prisma } from "@prisma/client";
import ms from "ms";

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
import { convertToUTC } from "@/src/utils/date/index.js";
import { addMinutes } from "date-fns";

const prisma = getPrisma();

export function calculateSlotRange(startTime: Date, endTime: Date) {
  const startSlot = getSlotNumberFromTimestamp(startTime.getTime());
  const endSlot = getSlotNumberFromTimestamp(endTime.getTime());
  return { startSlot, endSlot };
}

//
export function isProcessingTooEarly(endSlot: number) {
  const endSlotTime = getTimestampFromSlotNumber(endSlot);
  return Date.now() <= endSlotTime;
}

export async function hasUnprocessedSlots(endSlot: number): Promise<boolean> {
  // wait until the attestations are fetched for the endSlot
  const slot = await prisma.slot.findUnique({
    where: {
      slot: endSlot,
      attestationsFetched: true,
    },
  });
  return slot == null;
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
  endSlot: number
): Promise<boolean> {
  const endSlotTime = getTimestampFromSlotNumber(endSlot);
  const endEpoch = getEpochNumberFromTimestamp(endSlotTime);

  // We need at least one beacon reward epoch processed after the endTime because
  // We will remove all the beacon rewards before the endTime and
  // if the table is empty, fetching restarts from env.EXECUTION_BLOCK_LOOKBACK
  const beaconRewards = await prisma.epoch.findFirst({
    where: { epoch: { gt: endEpoch }, rewardsFetched: true },
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
  date: string
) {
  const values = batch
    .map(
      (stat) =>
        `(${stat.validatorIndex}, ${hour}, '${date}', ${stat._count.validatorIndex})`
    )
    .join(",");

  // if a validator haven't had rewards, the row won't exist
  await tx.$executeRawUnsafe(`
    INSERT INTO "HourlyValidatorStats" ("validatorIndex", "hour", "date", "attestationsMissed")
    VALUES ${values}
    ON CONFLICT ("validatorIndex", "hour", "date") 
    DO UPDATE SET "attestationsMissed" = "HourlyValidatorStats"."attestationsMissed"
  `);
}

export async function processExecutionRewardsBatch(
  tx: Prisma.TransactionClient,
  executionRewards: ValidatorExecutionRewards[],
  hour: number,
  date: string
) {
  const batches = chunk(executionRewards, 10000);

  for (const batch of batches) {
    // Convert the batch data to the format needed for createMany
    const data = batch.map((stat) => ({
      address: stat.address,
      hour: hour,
      date: date,
      amount: stat._sum.amount!,
    }));

    await tx.hourlyExecutionRewards.createMany({
      data: data,
    });
  }
}

export async function removeProcessedCommitteeRecords(
  tx: Prisma.TransactionClient,
  endSlot: number,
  logger: CustomLogger
) {
  logger.info(`Removing processed committee records up to Slot ${endSlot}`);

  await tx.committee.deleteMany({
    where: {
      slot: { lte: endSlot },
    },
  });
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
  date: string,
  endSlot: number,
  endTime: Date,
  logger: CustomLogger
) {
  const BATCH_SIZE = 5000;

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

      if (committeeValidators.length > 0 && executionRewards.length > 0) {
        await updateLastSummaryUpdate("hourlyValidatorStats", endTime, tx);
        await removeProcessedCommitteeRecords(tx, endSlot, logger);
        await removeProcessedExecutionRewards(tx, endTime, logger);
      } else {
        logger.warn(
          "ABORT: No committee validators or execution rewards to process"
        );
      }
    },
    { timeout: ms("10m") }
  );
}

export async function summarizeHourly(
  startTime: Date,
  endTime: Date,
  logger: CustomLogger
): Promise<void> {
  const { startSlot, endSlot } = calculateSlotRange(startTime, endTime);

  logger.info(`StartSlot: ${startSlot}, EndSlot: ${endSlot}`);

  const unprocessedSlots = await hasUnprocessedSlots(endSlot);
  if (unprocessedSlots) {
    logger.info(
      `Some slots before ${endSlot} are not fully processed. Skipping summarization.`
    );
    return;
  }

  const unprocessedExecutionRewards =
    await hasUnprocessedExecutionRewards(endTime);
  if (unprocessedExecutionRewards) {
    logger.info(
      `Some execution rewards before ${endTime} are not fully processed. Skipping summarization.`
    );
    return;
  }

  const unprocessedBeaconRewards = await hasUnprocessedBeaconRewards(endSlot);
  if (unprocessedBeaconRewards) {
    logger.info(
      `Some beacon rewards before slot ${endSlot} are not fully processed. Skipping summarization.`
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

  // we use hour and date in UTC to be consistent with the db timestamp
  const { hour, date } = convertToUTC(startTime);

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
}
