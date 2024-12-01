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

export async function fetchBeaconRewards(
  epochs: number[],
  logger: CustomLogger
) {
  try {
    const activeValidators = await getActiveValidators();
    logger.info(`Active validators: ${activeValidators.length}`);

    if (!activeValidators.length) {
      logger.warn(`No active validators found for epochs ${epochs.join(", ")}`);
      return;
    }

    // Create all epoch records in db if they don't exist
    await Promise.all(
      epochs.map((epochNumber) =>
        prisma.epoch.upsert({
          where: { epoch: epochNumber },
          create: { epoch: epochNumber, rewardsFetched: false },
          update: {}, // no update needed, just create if doesn't exist
        })
      )
    );

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

    // Sort epochs to process them in order
    const sortedEpochs = [...epochs].sort((a, b) => a - b);

    // Create a map to track promises for each epoch
    const epochPromisesMap = new Map(
      sortedEpochs.map((epochNumber) => [
        epochNumber,
        validatorIdBatches.map((validatorIds) =>
          getAttestationRewards(epochNumber, validatorIds)
        ),
      ])
    );

    // Process epochs in order as soon as their data is available
    for (const epochNumber of sortedEpochs) {
      logger.info(`Waiting for responses of epoch ${epochNumber}`);

      const responses = await Promise.all(epochPromisesMap.get(epochNumber)!);

      logger.info(`Processing epoch ${epochNumber}`);

      const epochTimestamp = getTimestampFromEpochNumber(epochNumber);
      const { date, hour } = convertToUTC(epochTimestamp);

      // Concatenate all rewards data for this epoch
      const rewardsData = responses.flatMap((response) =>
        response.data.total_rewards.map((validatorInfo) => ({
          validatorIndex: parseInt(validatorInfo.validator_index),
          epoch: epochNumber,
          head: BigInt(validatorInfo.head || "0"),
          target: BigInt(validatorInfo.target || "0"),
          source: BigInt(validatorInfo.source || "0"),
          inactivity: BigInt(validatorInfo.inactivity || "0"),
        }))
      );

      // Process database operations for this epoch
      await prisma.$transaction(
        async (tx) => {
          logger.info(`Creating temporary table`);
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
          logger.info(`Inserting done`);

          // Merge con la tabla principal
          logger.info(`Merging with main table`);
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

          // Update epoch status
          await tx.epoch.update({
            where: { epoch: epochNumber },
            data: { rewardsFetched: true },
          });
        },
        {
          timeout: ms("10m"),
        }
      );

      logger.info(`Done for epoch ${epochNumber}`);
    }
  } catch (error) {
    if (error.message.includes("404 - Aborting")) {
      logger.error(error.message, error);
      return;
    }
    logger.error(
      `Error fetching or inserting beacon rewards for epochs ${epochs.join(", ")}`,
      error
    );
  }
}
