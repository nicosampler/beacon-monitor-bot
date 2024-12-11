import { getSyncCommitteeRewards } from "@/src/beacon/endpoints.js";
import { CustomLogger } from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { Prisma } from "@prisma/client";
import ms from "ms";
import { convertToUTC } from "@/src/utils/date/index.js";
import { getTimestampFromSlotNumber } from "@/src/beacon/utils/time.js";

const prisma = getPrisma();

export const fetchSyncRewards = async (slot: number, logger: CustomLogger) => {
  try {
    logger.info("Fetch sync rewards");
    const syncCommitteeRewards = await getSyncCommitteeRewards(slot, []);
    logger.info("Fetch sync rewards done.");

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
      select: { syncRewardsFetched: true },
    });

    if (slotRecord?.syncRewardsFetched) {
      logger.warn(`Already fetched`);
      return;
    }

    // Process database operations
    await prisma.$transaction(
      async (tx) => {
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

        // Update slot status
        await tx.slot.update({
          where: { slot },
          data: { syncRewardsFetched: true },
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
        data: { syncRewardsFetched: true },
      });
      return;
    }
    logger.error(`Error processing sync rewards for slot ${slot}`, error);
    throw error;
  }
};
