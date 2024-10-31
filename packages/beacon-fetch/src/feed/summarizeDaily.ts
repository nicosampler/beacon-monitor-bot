import { Prisma } from "@prisma/client";
import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { updateLastSummaryUpdate } from "@/src/feed/utils.js";
import { CustomLogger } from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";
import chunk from "lodash/chunk.js";
import { convertToUTC } from "@/src/utils/date/index.js";
import { addDays } from "date-fns";

const prisma = getPrisma();

export function calculateSlotRange(startTime: Date, endTime: Date) {
  const startSlot = getSlotNumberFromTimestamp(startTime.getTime());
  const endSlot = getSlotNumberFromTimestamp(endTime.getTime());
  return { startSlot, endSlot };
}

export async function hasAllHourlyStats(date: Date): Promise<boolean> {
  const now = new Date();
  // Adding 1 day to be sure there is always 1 day of data to get daily stats
  const dateWithBuffer = addDays(date, 1);
  const _date = dateWithBuffer < now ? date : dateWithBuffer;
  const hasLastHour = await prisma.hourlyValidatorStats.findFirst({
    where: {
      hour: 0,
      date: addDays(_date, 1),
    },
  });
  return hasLastHour != null;
}

export async function hasAllExecutionRewards(date: Date): Promise<boolean> {
  const now = new Date();
  // Adding 1 day to be sure there is always 1 day of data to get daily stats
  const dateWithBuffer = addDays(date, 1);
  const _date = dateWithBuffer < now ? date : dateWithBuffer;
  const hasLastHour = await prisma.hourlyExecutionRewards.findFirst({
    where: {
      hour: 0,
      date: addDays(_date, 1),
    },
  });

  return hasLastHour != null;
}

export async function aggregateHourlyStats(date: Date) {
  return prisma.hourlyValidatorStats.groupBy({
    by: ["validatorIndex"],
    where: {
      date,
    },
    _sum: {
      head: true,
      target: true,
      source: true,
      inactivity: true,
      attestationsMissed: true,
    },
  });
}
export type AggregateHourlyStats = Awaited<
  ReturnType<typeof aggregateHourlyStats>
>[number];

export async function aggregateExecutionRewards(date: Date) {
  return prisma.hourlyExecutionRewards.groupBy({
    by: ["address"],
    where: {
      date,
    },
    _sum: {
      amount: true,
    },
  });
}
export type AggregateExecutionRewards = Awaited<
  ReturnType<typeof aggregateExecutionRewards>
>[number];

export async function processExecutionRewardsBatch(
  tx: Prisma.TransactionClient,
  executionRewards: AggregateExecutionRewards[],
  hour: number,
  date: string
) {
  const batches = chunk(executionRewards, 10000);

  for (const batch of batches) {
    const values = batch
      .map(
        (stat) => `('${stat.address}', ${hour}, '${date}', ${stat._sum.amount})`
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

export async function removeProcessedHourlyStatsRecords(
  tx: Prisma.TransactionClient,
  date: Date,
  logger: CustomLogger
) {
  logger.info(`Removing processed HourlyStats for ${date}`);

  await tx.hourlyValidatorStats.deleteMany({
    where: {
      date,
    },
  });
}

export async function removeProcessedExecutionRewards(
  tx: Prisma.TransactionClient,
  date: Date,
  logger: CustomLogger
) {
  logger.info(`Removing processed ExecutionRewards for ${date}`);
  await tx.hourlyExecutionRewards.deleteMany({
    where: {
      date,
    },
  });
}

export async function summarizeAtomicTransaction(
  hourlyStates: AggregateHourlyStats[],
  executionRewards: AggregateExecutionRewards[],
  day: number,
  date: Date,
  logger: CustomLogger
) {
  const BATCH_SIZE = 5000;

  await prisma.$transaction(
    async (tx) => {
      logger.info(`Creating daily validator stats`);
      for (let i = 0; i < hourlyStates.length; i += BATCH_SIZE) {
        const batch = hourlyStates.slice(i, i + BATCH_SIZE);

        await tx.dailyValidatorStats.createMany({
          data: batch.map((stat) => ({
            validatorIndex: stat.validatorIndex,
            date,
            head: stat._sum.head || null,
            target: stat._sum.target || null,
            source: stat._sum.source || null,
            inactivity: stat._sum.inactivity || null,
            attestationsMissed: stat._sum.attestationsMissed || null,
          })),
        });
      }

      logger.info(`Creating daily execution rewards`);
      for (let i = 0; i < executionRewards.length; i += BATCH_SIZE) {
        const batch = executionRewards.slice(i, i + BATCH_SIZE);
        await tx.dailyExecutionRewards.createMany({
          data: batch.map((stat) => ({
            address: stat.address,
            amount: stat._sum.amount || 0,
            date,
            day,
          })),
        });
      }

      if (hasAllHourlyStats.length > 0 || hasAllExecutionRewards.length > 0) {
        await updateLastSummaryUpdate("dailyValidatorStats", date, tx);
        await removeProcessedHourlyStatsRecords(tx, date, logger);
        await removeProcessedExecutionRewards(tx, date, logger);
      }
    },
    { timeout: 1000 * 60 * 20 }
  );

  logger.info("Done.");
}

export async function summarizeDaily(
  date: Date,
  day: number,
  logger: CustomLogger
): Promise<void> {
  if (!(await hasAllHourlyStats(date))) {
    logger.info(`No hourly stats ready, skipping`);
    return;
  }

  if (!(await hasAllExecutionRewards(date))) {
    logger.info(`No execution rewards ready, skipping`);
    return;
  }

  // Missed attestations
  const hourlyStats = await aggregateHourlyStats(date);
  const executionRewards = await aggregateExecutionRewards(date);

  // update the hourly validator stats
  await summarizeAtomicTransaction(
    hourlyStats,
    executionRewards,
    day,
    date,
    logger
  );
}
