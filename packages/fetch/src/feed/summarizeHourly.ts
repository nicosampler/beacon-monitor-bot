import { Prisma } from '@prisma/client';
import chunk from 'lodash/chunk.js';
import ms from 'ms';

import { calculateSlotRange } from '@/src/beacon/utils/misc.js';
import {
  getEpochNumberFromTimestamp,
  getTimestampFromSlotNumber,
} from '@/src/beacon/utils/time.js';
import { env } from '@/src/env.js';
import { updateLastSummaryUpdate } from '@/src/feed/utils.js';
import { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';
import { convertToUTC } from '@/src/utils/date/index.js';

const prisma = getPrisma();

/* 
  All slots up to endSlot should have been processed.
  A slot is processed when their attestations are fetched.
*/
export async function hasUnprocessedSlots(endSlot: number): Promise<boolean> {
  const slot = await prisma.slot.findUnique({
    where: {
      slot: endSlot,
      attestationsFetched: true,
    },
  });
  return slot == null;
}

export async function hasUnprocessedExecutionRewards(endTime: Date): Promise<boolean> {
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

/*
 * All epoch rewards up to endEpoch should have been processed.
 * A epoch is processed when their rewards are fetched.
 */
export async function hasUnprocessedBeaconRewards(endSlot: number): Promise<boolean> {
  const endSlotTime = getTimestampFromSlotNumber(endSlot);
  const endEpoch = getEpochNumberFromTimestamp(endSlotTime);

  const beaconRewards = await prisma.epoch.findFirst({
    // We need at least one beacon reward epoch processed after the endSlot
    // because we will remove all the beacon rewards before the endSlot
    // and if the table is empty, fetching restarts from env.BEACON_LOOKBACK_EPOCH
    where: { epoch: { gt: endEpoch }, rewardsFetched: true },
  });

  return beaconRewards == null;
}

export async function aggregateMissedAttestations(startSlot: number, endSlot: number) {
  return prisma.committee.groupBy({
    by: ['validatorIndex'],
    where: {
      AND: [
        { slot: { gte: startSlot, lte: endSlot } },
        {
          OR: [
            { attestationDelay: null },
            { attestationDelay: { gt: env.BEACON_MAX_ATTESTATION_DELAY } },
          ],
        },
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

export async function aggregateExecutionRewards(startDate: Date, endDate: Date) {
  return prisma.executionRewards.groupBy({
    by: ['address'],
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
  date: string,
) {
  const values = batch
    .map((stat) => `(${stat.validatorIndex}, ${hour}, '${date}', ${stat._count.validatorIndex})`)
    .join(',');

  // if a validator haven't had rewards, the row won't exist
  await tx.$executeRawUnsafe(`
    INSERT INTO "HourlyValidatorStats" ("validatorIndex", "hour", "date", "attestationsMissed")
    VALUES ${values}
    ON CONFLICT ("validatorIndex", "hour", "date") 
    DO UPDATE SET "attestationsMissed" = EXCLUDED."attestationsMissed"
  `);
}

export async function processExecutionRewardsBatch(
  tx: Prisma.TransactionClient,
  executionRewards: ValidatorExecutionRewards[],
  hour: number,
  date: string,
) {
  const batches = chunk(executionRewards, 5000);

  for (const batch of batches) {
    // Convert the batch data to the format needed for createMany
    const data = batch.map((stat) => ({
      address: stat.address,
      hour: hour,
      date: new Date(date),
      amount: stat._sum.amount!,
    }));

    await tx.hourlyExecutionRewards.createMany({
      data: data,
    });
  }
}

export async function removeProcessedExecutionRewards(
  tx: Prisma.TransactionClient,
  endTime: Date,
  logger: CustomLogger,
) {
  logger.info(`Removing processed execution rewards before ${endTime}`);
  await tx.executionRewards.deleteMany({
    where: {
      timestamp: { lt: endTime },
    },
  });
}

export async function summarizeAtomicTransaction(
  validatorsMissedAttestations: ValidatorMissedAttestations[],
  executionRewards: ValidatorExecutionRewards[],
  hour: number,
  date: string,
  endTime: Date,
  logger: CustomLogger,
) {
  const BATCH_SIZE = 5000;

  await prisma.$transaction(
    async (tx) => {
      if (validatorsMissedAttestations.length > 0 && executionRewards.length > 0) {
        // Process missed attestations in batches
        const missedAttestationBatches = chunk(validatorsMissedAttestations, BATCH_SIZE);
        for (const batch of missedAttestationBatches) {
          await processCommitteeValidatorsBatch(tx, batch, hour, date);
        }

        // Process execution rewards in batches
        const executionRewardBatches = chunk(executionRewards, BATCH_SIZE);
        for (const batch of executionRewardBatches) {
          await processExecutionRewardsBatch(tx, batch, hour, date);
        }

        await updateLastSummaryUpdate('hourlyValidatorStats', endTime, tx);
        // await removeProcessedCommitteeRecords(tx, endSlot, logger);
        // TODO: move cleanup to a separate task
        await removeProcessedExecutionRewards(tx, endTime, logger);
      } else {
        logger.warn('ABORT: No committee validators or execution rewards to process');
      }
    },
    { timeout: ms('10m') },
  );
}

export async function summarizeHourly(
  startTime: Date,
  endTime: Date,
  logger: CustomLogger,
): Promise<void> {
  const { startSlot, endSlot } = calculateSlotRange(startTime, endTime);

  logger.info(`StartSlot: ${startSlot}, EndSlot: ${endSlot}`);

  const unprocessedSlots = await hasUnprocessedSlots(endSlot);
  if (unprocessedSlots) {
    logger.info(`Some slots before ${endSlot} are not fully processed. Skipping summarization.`);
    return;
  }

  const unprocessedExecutionRewards = await hasUnprocessedExecutionRewards(endTime);
  if (unprocessedExecutionRewards) {
    logger.info(
      `Some execution rewards before ${endTime} are not fully processed. Skipping summarization.`,
    );
    return;
  }

  const unprocessedBeaconRewards = await hasUnprocessedBeaconRewards(endSlot);
  if (unprocessedBeaconRewards) {
    logger.info(
      `Some beacon rewards before slot ${endSlot} are not fully processed. Skipping summarization.`,
    );
    return;
  }

  // Missed attestations
  const validatorsMissedAttestations = await aggregateMissedAttestations(startSlot, endSlot);

  // Execution rewards
  const executionRewards = await aggregateExecutionRewards(startTime, endTime);

  // we use hour and date in UTC to be consistent with the db timestamp
  const { hour, date } = convertToUTC(startTime);

  logger.info(`Ready to summarize.`);

  // update the hourly validator stats
  await summarizeAtomicTransaction(
    validatorsMissedAttestations,
    executionRewards,
    hour,
    date,
    endTime,
    logger,
  );
}
