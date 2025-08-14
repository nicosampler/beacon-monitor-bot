import { Prisma } from '@prisma/client';
import { addDays } from 'date-fns';
import ms from 'ms';

import { getEpochFromSlot } from '@/src/beacon/utils/misc.js';
import { getSlotNumberFromTimestamp } from '@/src/beacon/utils/time.js';
import { env } from '@/src/env.js';
import { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';
import { updateLastSummaryUpdate } from '@/src/utils/db.js';

const prisma = getPrisma();

export type AggregateHourlyStats = Awaited<ReturnType<typeof aggregateHourlyStats>>[number];

interface HourlyStats {
  validatorIndex: number;
  _sum: {
    head: bigint;
    target: bigint;
    source: bigint;
    inactivity: bigint;
    attestationsMissed: number;
    syncCommittee: bigint;
    blockReward: bigint;
  };
}

export async function canSummarize(lastSummaryUpdate: Date): Promise<boolean> {
  const nextDay = addDays(lastSummaryUpdate, 1);
  const nextDaySlot = getSlotNumberFromTimestamp(nextDay.getTime());
  const nextDaySlotWithDelay = nextDaySlot + env.BEACON_SLOTS_PER_EPOCH;

  // check if all epoch rewards have been fetched
  const beaconRewardsFetched = await prisma.epoch.findUnique({
    where: {
      epoch: getEpochFromSlot(nextDaySlotWithDelay),
      rewardsFetched: true,
    },
  });
  if (!beaconRewardsFetched) {
    return false;
  }

  // check if all rewards for the slot have been fetched
  const syncCommitteeAndBlockRewardsFetched = await prisma.slot.findFirst({
    where: {
      slot: nextDaySlotWithDelay,
      blockAndSyncRewardsFetched: true,
    },
  });
  return syncCommitteeAndBlockRewardsFetched != null;
}

export async function aggregateHourlyStats(date: Date) {
  const stats = await prisma.$queryRaw<Array<HourlyStats>>`
    WITH combined_rewards AS (
      -- Attestation (rewards and missed attestations)
      SELECT 
        "validatorIndex",
        COALESCE(head, 0) as head,
        COALESCE(target, 0) as target,
        COALESCE(source, 0) as source,
        COALESCE(inactivity, 0) as inactivity,
        COALESCE("attestationsMissed", 0) as "attestationsMissed",
        COALESCE("syncCommittee", 0) as "syncCommittee", -- TMP: remove this 
        COALESCE("blockReward", 0) as "blockReward" -- TMP: remove this 
      FROM "HourlyValidatorStats"
      WHERE date = ${date}
      
      UNION ALL
      
      -- Block and sync rewards 
      SELECT 
        "validatorIndex",
        0 as head,
        0 as target,
        0 as source,
        0 as inactivity,
        0 as "attestationsMissed",
        COALESCE("syncCommittee", 0) as "syncCommittee",
        COALESCE("blockReward", 0) as "blockReward"
      FROM "HourlyBlockAndSyncRewards"
      WHERE date = ${date}
    )
    SELECT 
      "validatorIndex",
      json_build_object(
        'head', SUM(head),
        'target', SUM(target),
        'source', SUM(source),
        'inactivity', SUM(inactivity),
        'attestationsMissed', SUM("attestationsMissed"),
        'syncCommittee', SUM("syncCommittee"),
        'blockReward', SUM("blockReward")
      ) as "_sum"
    FROM combined_rewards
    GROUP BY "validatorIndex"`;

  return stats;
}

export async function removeProcessedHourlyStatsRecords(
  tx: Prisma.TransactionClient,
  date: Date,
  logger: CustomLogger,
) {
  logger.info(`Removing processed HourlyStats and HourlyBlockAndSyncRewards for ${date}`);

  await Promise.all([
    tx.hourlyValidatorStats.deleteMany({
      where: { date },
    }),
    tx.hourlyBlockAndSyncRewards.deleteMany({
      where: { date },
    }),
  ]);
}

export async function summarizeAtomicTransaction(
  hourlyStates: AggregateHourlyStats[],
  day: number,
  date: Date,
  logger: CustomLogger,
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

      if (canSummarize.length > 0) {
        await updateLastSummaryUpdate('dailyValidatorStats', addDays(date, 1), tx);
        await removeProcessedHourlyStatsRecords(tx, date, logger);
      }
    },
    { timeout: ms('5m') },
  );

  logger.info('Done.');
}

export async function summarizeDaily(
  lastSummaryUpdate: Date,
  lastSummaryUpdateDay: number,
  logger: CustomLogger,
): Promise<void> {
  if (!(await canSummarize(lastSummaryUpdate))) {
    logger.info(`Missing rewards stats for ${lastSummaryUpdate}, skipping`);
    return;
  }

  // Aggregate hourly stats
  logger.info(`Aggregating hourly stats`);
  const hourlyStats = await aggregateHourlyStats(lastSummaryUpdate);
  logger.info(`Aggregated ${hourlyStats.length} hourly stats`);

  // update the daily validator stats
  await summarizeAtomicTransaction(hourlyStats, lastSummaryUpdateDay, lastSummaryUpdate, logger);
}
