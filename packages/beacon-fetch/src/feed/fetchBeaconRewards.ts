import ms from "ms";
import { Prisma } from "@prisma/client";

import { getAttestationRewards } from "@/src/beacon/endpoints.js";
import { CustomLogger } from "@/src/lib/pino.js";
import {
  getActiveValidators,
  getHighestValidatorId,
} from "@/src/feed/utils.js";
import chunk from "lodash/chunk.js";
import { getPrisma } from "@/src/lib/prisma.js";

import { getTimestampFromEpochNumber } from "@/src/beacon/utils/time.js";
import { convertToUTC } from "@/src/utils/date/index.js";

const prisma = getPrisma();

export async function fetchBeaconRewards(epoch: number, logger: CustomLogger) {
  try {
    // TODO: cache this, and only fetch if new validators were found.
    const activeValidators = await getActiveValidators();
    logger.info(`Active validators: ${activeValidators.length}`);

    if (!activeValidators.length) {
      logger.warn(`No active validators found for epoch ${epoch}`);
      return;
    }

    // Create epoch record in db if it doesn't exist
    await prisma.epoch.upsert({
      where: { epoch },
      create: { epoch, rewardsFetched: false },
      update: {}, // no update needed, just create if doesn't exist
    });

    const highestValidatorId = await getHighestValidatorId();

    // Get validator IDs that we will use to fetch rewards for
    const activeValidatorsIds = new Set(activeValidators.map((v) => v));
    const allValidatorIds = Array.from(
      { length: highestValidatorId + 1 },
      (_, i) => i
    )
      .filter((id) => activeValidatorsIds.has(id))
      .map((id) => id.toString());

    const validatorIdBatches = chunk(allValidatorIds, 250000);

    logger.info(`Waiting for responses of epoch ${epoch}`);

    const responses = await Promise.all(
      validatorIdBatches.map((validatorIds) =>
        getAttestationRewards(epoch, validatorIds)
      )
    );

    logger.info(`Processing epoch ${epoch}`);

    const epochTimestamp = getTimestampFromEpochNumber(epoch);
    const { date, hour } = convertToUTC(epochTimestamp);

    // Concatenate all rewards data for this epoch
    const rewardsData = responses.flatMap((response) =>
      response.data.total_rewards.map((validatorInfo) => ({
        validatorIndex: Number(validatorInfo.validator_index),
        epoch: epoch,
        head: BigInt(validatorInfo.head || "0"),
        target: BigInt(validatorInfo.target || "0"),
        source: BigInt(validatorInfo.source || "0"),
        inactivity: BigInt(validatorInfo.inactivity || "0"),
      }))
    );

    // Process database operations for this epoch
    await prisma.$transaction(
      async (tx) => {
        //logger.info(`Creating temporary table`);
        await tx.$executeRaw`
          CREATE TEMPORARY TABLE temp_validator_stats (
            LIKE "HourlyValidatorStats" INCLUDING ALL
          ) ON COMMIT DROP
        `;
        const batches = chunk(rewardsData, 100000);
        for (const batch of batches) {
          const values = batch
            .map(
              (reward) =>
                `(${reward.validatorIndex}, ${hour}, '${date}', ${reward.head}, ${reward.target}, ${reward.source}, ${reward.inactivity})`
            )
            .join(",");

          await tx.$executeRaw`
            INSERT INTO temp_validator_stats VALUES ${Prisma.raw(values)}
          `;
        }
        // logger.info(`Inserting done`);

        // Merge con la tabla principal
        //logger.info(`Merging with main table`);
        await tx.$executeRaw`
          INSERT INTO "HourlyValidatorStats"
          SELECT * FROM temp_validator_stats
          ON CONFLICT ("validatorIndex", "hour", "date") 
          DO UPDATE SET
            "head" = "HourlyValidatorStats"."head" + EXCLUDED."head",
            "target" = "HourlyValidatorStats"."target" + EXCLUDED."target",
            "source" = "HourlyValidatorStats"."source" + EXCLUDED."source",
            "inactivity" = "HourlyValidatorStats"."inactivity" + EXCLUDED."inactivity"
        `;

        // check if rewards was fetched for this epoch
        const dbEpoch = await tx.epoch.findUnique({
          where: { epoch },
        });

        if (dbEpoch.rewardsFetched) {
          logger.warn(`Rewards already fetched for epoch ${epoch}`);
          return;
        }

        // Update epoch status
        await tx.epoch.update({
          where: { epoch },
          data: { rewardsFetched: true },
        });
      },
      {
        timeout: ms("10m"),
      }
    );
  } catch (error) {
    if (error.message.includes("404 - Aborting")) {
      logger.error(error.message, error);
      return;
    }
    logger.error(
      `Error fetching or inserting beacon rewards for epoch ${epoch}`,
      error
    );
  }
}
