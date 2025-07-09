import { Prisma } from '@prisma/client';
import ms from 'ms';

import { beacon_getBlockRewards, beacon_getSyncCommitteeRewards } from '@/src/beacon/endpoints.js';
import { SyncCommitteeRewards, type BlockRewards } from '@/src/beacon/types.js';
import { getEpochFromSlot } from '@/src/beacon/utils/misc.js';
import { getTimestampFromSlotNumber } from '@/src/beacon/utils/time.js';
import { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';
import { convertToUTC } from '@/src/utils/date/index.js';
import { db_getSyncCommitteeValidators } from '@/src/utils/db.js';

const prisma = getPrisma();

interface SyncRewardValues {
  validatorIndex: number;
  hour: number;
  date: string;
  syncCommittee: bigint;
}

interface BlockRewardValues {
  validatorIndex: number;
  hour: number;
  date: string;
  blockReward: bigint;
}

function prepareSyncRewards(
  syncRewardsData: SyncCommitteeRewards['data'],
  hour: number,
  date: string,
): SyncRewardValues[] {
  return syncRewardsData.map((syncReward) => ({
    validatorIndex: Number(syncReward.validator_index),
    hour,
    date,
    syncCommittee: BigInt(syncReward.reward),
  }));
}

function prepareBlockRewards(
  blockRewards: 'SLOT MISSED' | BlockRewards,
  hour: number,
  date: string,
): BlockRewardValues | null {
  if (blockRewards === 'SLOT MISSED') return null;

  return {
    validatorIndex: Number(blockRewards.data.proposer_index),
    hour,
    date,
    blockReward: BigInt(blockRewards.data.total),
  };
}

/**
 * Prefetches rewards for future slots to improve performance when the bot is behind head.
 * This is particularly useful when the bot has been down and needs to catch up with rewards.
 * The requests are deduplicated by memoizee, so we can safely fire them in advance.
 */
// function prefetchFutureRewards(slot: number, maxSlotToFetch: number) {
//   for (let i = 1; i <= 5; i++) {
//     const futureSlot = slot + i;
//     if (futureSlot > maxSlotToFetch) break;
//     beacon_getSyncCommitteeRewards(futureSlot, []);
//     beacon_getBlockRewards(futureSlot);
//   }
// }

export const fetchBlockAndSyncRewards = async (
  slot: number,
  maxSlotToFetch: number,
  logger: CustomLogger,
) => {
  try {
    const dbSlot = await prisma.slot.findUnique({
      where: { slot },
    });

    if (!dbSlot) {
      logger.warn(`Slot ${slot} not found in database`);
      return;
    }

    if (dbSlot.blockAndSyncRewardsFetched) {
      logger.warn(`Slot ${slot} already fetched`);
      return;
    }

    // Check if the sync committee exists for this epoch
    const epoch = getEpochFromSlot(slot);
    const syncCommitteeValidators = await db_getSyncCommitteeValidators(epoch);
    if (!syncCommitteeValidators) {
      logger.error(`Sync committee not found for epoch ${epoch}`, {});
      return;
    }

    // fetch sync committee and block rewards for current slot
    const currentSlotRequests = Promise.all([
      beacon_getSyncCommitteeRewards(slot, syncCommitteeValidators),
      beacon_getBlockRewards(slot),
    ]);
    const [syncCommitteeRewards, blockRewards] = await currentSlotRequests;

    if (syncCommitteeRewards === 'SLOT MISSED' && blockRewards === 'SLOT MISSED') {
      await prisma.slot.update({
        where: { slot },
        data: { blockAndSyncRewardsFetched: true },
      });
      return;
    }

    // Prefetch future rewards to improve performance when the indexer is behind head
    // prefetchFutureRewards(slot, maxSlotToFetch);

    logger.info(`Saving rewards`);
    const timestamp = getTimestampFromSlotNumber(slot);
    const { date, hour } = convertToUTC(timestamp);
    await prisma.$transaction(
      async (tx) => {
        // Prepare rewards data
        const syncRewards = prepareSyncRewards(
          (syncCommitteeRewards as SyncCommitteeRewards).data,
          hour,
          date,
        );
        const blockReward = prepareBlockRewards(blockRewards, hour, date);

        // Save sync committee rewards
        if (syncRewards.length > 0) {
          const sqlValues = syncRewards
            .map(
              (v) => `(${v.validatorIndex}, ${v.hour}, '${v.date}'::date, ${v.syncCommittee}, 0)`,
            )
            .join(',');

          await tx.$executeRaw`
            INSERT INTO "HourlyBlockAndSyncRewards" 
              ("validatorIndex", "hour", "date", "syncCommittee", "blockReward")
            VALUES ${Prisma.raw(sqlValues)}
            ON CONFLICT ("validatorIndex", "hour", "date") 
            DO UPDATE SET
              "syncCommittee" = COALESCE("HourlyBlockAndSyncRewards"."syncCommittee", 0) + EXCLUDED."syncCommittee",
              "blockReward" = COALESCE("HourlyBlockAndSyncRewards"."blockReward", 0)
          `;
        }

        // Save block rewards
        if (blockReward) {
          await tx.$executeRaw`
            INSERT INTO "HourlyBlockAndSyncRewards" 
              ("validatorIndex", "hour", "date", "blockReward", "syncCommittee")
            VALUES (${blockReward.validatorIndex}, ${blockReward.hour}, ${blockReward.date}::date, ${blockReward.blockReward}, 0)
            ON CONFLICT ("validatorIndex", "hour", "date") 
            DO UPDATE SET
              "blockReward" = COALESCE("HourlyBlockAndSyncRewards"."blockReward", 0) + EXCLUDED."blockReward",
              "syncCommittee" = COALESCE("HourlyBlockAndSyncRewards"."syncCommittee", 0)
          `;
        }

        // Update slot status
        await tx.slot.update({
          where: { slot },
          data: { blockAndSyncRewardsFetched: true },
        });
      },
      {
        timeout: ms('5m'),
      },
    );

    logger.info(`Done.`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      logger.warn(`skipped`);
      await prisma.slot.update({
        where: { slot },
        data: { blockAndSyncRewardsFetched: true },
      });
      return;
    }
    logger.error(`Error processing sync rewards for slot ${slot}`, error);
    throw error;
  }
};
