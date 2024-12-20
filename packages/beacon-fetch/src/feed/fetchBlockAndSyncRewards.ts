import {
  getBlockRewards,
  getSyncCommitteeRewards,
} from "@/src/beacon/endpoints.js";
import { CustomLogger } from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { Prisma } from "@prisma/client";
import ms from "ms";
import { convertToUTC } from "@/src/utils/date/index.js";
import { getTimestampFromSlotNumber } from "@/src/beacon/utils/time.js";

const prisma = getPrisma();

export const fetchBlockAndSyncRewards = async (
  slot: number,
  maxSlotToFetch: number,
  logger: CustomLogger
) => {
  try {
    const dbSlot = await prisma.slot.findUnique({
      where: { slot },
      select: { blockAndSyncRewardsFetched: true },
    });

    if (!dbSlot) {
      logger.warn(`Slot ${slot} not found in database`);
      return;
    }

    logger.info("api call sync & block rewards");

    // Current slot requests
    const currentSlotRequests = Promise.all([
      getSyncCommitteeRewards(slot, []),
      getBlockRewards(slot),
    ]);

    // Just fire the requests for future slots - memoizee will handle deduplication
    for (let i = 1; i <= 10; i++) {
      const futureSlot = slot + i;
      if (futureSlot > maxSlotToFetch) break;
      getSyncCommitteeRewards(futureSlot, []);
      getBlockRewards(futureSlot);
    }

    const [syncCommitteeRewards, blockRewards] = await currentSlotRequests;

    const timestamp = getTimestampFromSlotNumber(slot);
    const { date, hour } = convertToUTC(timestamp);

    // Format rewards data
    const rewardsData = syncCommitteeRewards.data.map((reward) => ({
      validatorIndex: Number(reward.validator_index),
      reward: BigInt(reward.reward),
      hour,
      date,
    }));

    // Check if sync rewards were already fetched
    const slotRecord = await prisma.slot.findUnique({
      where: { slot },
      select: { blockAndSyncRewardsFetched: true },
    });

    if (!slotRecord) {
      return;
    }

    if (slotRecord?.blockAndSyncRewardsFetched) {
      logger.warn(`Already fetched`);
      return;
    }

    logger.info(`Saving rewards`);
    await prisma.$transaction(
      async (tx) => {
        // Sync rewards
        const values = rewardsData
          .map(
            (syncReward) =>
              `(${syncReward.validatorIndex}, ${hour}, '${date}', ${syncReward.reward})`
          )
          .join(",");

        await tx.$executeRaw`
          INSERT INTO "HourlyValidatorStats" ("validatorIndex", "hour", "date", "syncCommittee")
          VALUES ${Prisma.raw(values)}
          ON CONFLICT ("validatorIndex", "hour", "date") 
          DO UPDATE SET
            "head" = COALESCE("HourlyValidatorStats"."head", 0),
            "target" = COALESCE("HourlyValidatorStats"."target", 0),
            "source" = COALESCE("HourlyValidatorStats"."source", 0),
            "inactivity" = COALESCE("HourlyValidatorStats"."inactivity", 0),
            "syncCommittee" = COALESCE("HourlyValidatorStats"."syncCommittee", 0) + EXCLUDED."syncCommittee"
        `;

        // Block rewards
        if (blockRewards !== "SLOT MISSED") {
          const blockRewardValue = `(${Number(blockRewards.data.proposer_index)}, ${hour}, '${date}', ${BigInt(blockRewards.data.total)})`;

          await tx.$executeRaw`
            INSERT INTO "HourlyValidatorStats" ("validatorIndex", "hour", "date", "blockReward")
            VALUES ${Prisma.raw(blockRewardValue)}
            ON CONFLICT ("validatorIndex", "hour", "date") 
            DO UPDATE SET
              "blockReward" = EXCLUDED."blockReward",
              "head" = COALESCE("HourlyValidatorStats"."head", 0),
              "target" = COALESCE("HourlyValidatorStats"."target", 0),
              "source" = COALESCE("HourlyValidatorStats"."source", 0),
              "inactivity" = COALESCE("HourlyValidatorStats"."inactivity", 0),
              "syncCommittee" = COALESCE("HourlyValidatorStats"."syncCommittee", 0)
          `;
        }

        // Update slot status
        await tx.slot.update({
          where: { slot },
          data: { blockAndSyncRewardsFetched: true },
        });
      },
      {
        timeout: ms("5m"),
      }
    );

    logger.info(`Done.`);
  } catch (error) {
    if (error.message.includes("404")) {
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
