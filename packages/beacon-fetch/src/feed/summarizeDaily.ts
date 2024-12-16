import ms from "ms";

import { Prisma } from "@prisma/client";
import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { updateLastSummaryUpdate } from "@/src/feed/utils.js";
import { CustomLogger } from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";
import chunk from "lodash/chunk.js";
import { addDays, addHours } from "date-fns";
import { getEpochFromSlot } from "@/src/beacon/utils/misc.js";
import { env } from "@/src/env.js";

export type AggregateHourlyStats = Awaited<
  ReturnType<typeof aggregateHourlyStats>
>[number];

export type AggregateExecutionRewards = Awaited<
  ReturnType<typeof aggregateExecutionRewards>
>[number];

const prisma = getPrisma();

export function calculateSlotRange(startTime: Date, endTime: Date) {
  const startSlot = getSlotNumberFromTimestamp(startTime.getTime());
  const endSlot = getSlotNumberFromTimestamp(endTime.getTime());
  return { startSlot, endSlot };
}

export async function hasAllHourlyStats(date: Date): Promise<boolean> {
  const nextDay = addDays(date, 1);
  const nextDaySlot =
    getSlotNumberFromTimestamp(nextDay.getTime()) + env.BEACON_SLOTS_PER_EPOCH;

  console.log(">>> SLOT", nextDaySlot);
  console.log(">>> EPOCH", getEpochFromSlot(nextDaySlot));

  const beaconRewardsFetched = await prisma.epoch.findUnique({
    where: {
      epoch: getEpochFromSlot(nextDaySlot),
      rewardsFetched: true,
    },
  });

  if (!beaconRewardsFetched) {
    return false;
  }

  const syncCommitteeAndBlockRewardsFetched = await prisma.slot.findFirst({
    where: {
      slot: nextDaySlot,
      blockAndSyncRewardsFetched: true,
    },
  });

  return syncCommitteeAndBlockRewardsFetched != null;
}

export async function hasAllExecutionRewards(date: Date): Promise<boolean> {
  // Same logic - check for hour 0 of next day
  const hasLastHour = await prisma.hourlyExecutionRewards.findFirst({
    where: {
      hour: 0,
      date: addDays(date, 1),
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
      syncCommittee: true,
      blockReward: true,
    },
  });
}

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
  const BATCH_SIZE = 100000;

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
            syncCommittee: stat._sum.syncCommittee || null,
            blockReward: stat._sum.blockReward || null,
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
        await updateLastSummaryUpdate(
          "dailyValidatorStats",
          addDays(date, 1),
          tx
        );
        await removeProcessedHourlyStatsRecords(tx, date, logger);
        await removeProcessedExecutionRewards(tx, date, logger);
      }
    },
    { timeout: ms("5m") }
  );

  logger.info("Done.");
}

// TODO: add explanation about the requirements for the daily stats to run.
export async function summarizeDaily(
  date: Date,
  day: number,
  logger: CustomLogger
): Promise<void> {
  if (!(await hasAllHourlyStats(date))) {
    logger.info(`Missing hourly stats for ${date}, skipping`);
    return;
  }

  if (!(await hasAllExecutionRewards(date))) {
    logger.info(`Missing execution rewards for ${date}, skipping`);
    return;
  }

  // Aggregate hourly stats
  const hourlyStats = await aggregateHourlyStats(date);
  const executionRewards = await aggregateExecutionRewards(date);

  // update the daily validator stats
  await summarizeAtomicTransaction(
    hourlyStats,
    executionRewards,
    day,
    date,
    logger
  );
}
