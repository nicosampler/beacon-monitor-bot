import ms from "ms";
import { Prisma } from "@prisma/client";

import { getAttestationRewards } from "@/src/beacon/endpoints.js";
import { CustomLogger } from "@/src/lib/pino.js";
import { getHighestValidatorId } from "@/src/feed/utils.js";
import chunk from "lodash/chunk.js";
import { VALIDATOR_STATUS } from "@/src/constants/index.js";
import { getPrisma } from "@/src/lib/prisma.js";

import { getTimestampFromEpochNumber } from "@/src/beacon/utils/time.js";
import { convertToUTC } from "@/src/utils/date/index.js";

const prisma = getPrisma();

export async function fetchBeaconRewards(
  epochNumber: number,
  logger: CustomLogger
) {
  const epochTimestamp = getTimestampFromEpochNumber(epochNumber);
  const { date, hour } = convertToUTC(epochTimestamp);

  try {
    // Create the epoch record in db if it doesn't exist
    await prisma.epoch.upsert({
      where: { epoch: epochNumber },
      create: { epoch: epochNumber, rewardsFetched: false },
      update: {}, // no update needed, just create if doesn't exist
    });

    const highestValidatorId = await getHighestValidatorId();

    // Get from db validator filtered by the beacon status
    const activeValidators = await prisma.validator.findMany({
      where: {
        status: {
          in: [
            VALIDATOR_STATUS.ACTIVE_ONGOING,
            VALIDATOR_STATUS.ACTIVE_EXITING,
            VALIDATOR_STATUS.PENDING_QUEUED,
          ],
        },
      },
      select: { id: true },
    });
    if (!activeValidators.length) {
      logger.info(`No active validators found for epoch ${epochNumber}`);
      return;
    }

    // Get validator IDs that we will use to fetch rewards for
    const activeValidatorsIds = new Set(activeValidators.map((v) => v.id));
    const allValidatorIds = Array.from(
      { length: highestValidatorId + 1 },
      (_, i) => i
    )
      .filter((id) => activeValidatorsIds.has(id))
      .map((id) => id.toString());

    // fetch rewards for each validator in batches
    const validatorIdBatches = chunk(allValidatorIds, 150000);
    const rewardsPromises = validatorIdBatches.map((validatorIds) =>
      getAttestationRewards(epochNumber, validatorIds)
    );
    const responses = await Promise.all(rewardsPromises);
    if (responses.some((res) => res.status === 404)) {
      throw new Error("404 - Aborting");
    }

    // Concatenate all rewards data
    const rewardsData = responses.flatMap((response) =>
      response.data.data.total_rewards.map((validatorInfo) => ({
        validatorIndex: parseInt(validatorInfo.validator_index),
        epoch: epochNumber,
        head: BigInt(validatorInfo.head || "0"),
        target: BigInt(validatorInfo.target || "0"),
        source: BigInt(validatorInfo.source || "0"),
        inactivity: BigInt(validatorInfo.inactivity || "0"),
      }))
    );

    // Process all database operations in a single transaction
    await prisma.$transaction(
      async (tx) => {
        const rewardsDataBatches = chunk(rewardsData, 5000);
        for (const batch of rewardsDataBatches) {
          const values = batch
            .map(
              (reward) =>
                `(${reward.validatorIndex}, ${hour}, '${date}', ${reward.head}, ${reward.target}, ${reward.source}, ${reward.inactivity})`
            )
            .join(",");

          await prisma.$executeRaw`
            INSERT INTO "HourlyValidatorStats" ("validatorIndex", "hour", "date", "head", "target", "source", "inactivity")
            VALUES ${Prisma.raw(values)}
            ON CONFLICT ("validatorIndex", "hour", "date") DO UPDATE SET
              "head" = "HourlyValidatorStats"."head" + EXCLUDED."head",
              "target" = "HourlyValidatorStats"."target" + EXCLUDED."target",
              "source" = "HourlyValidatorStats"."source" + EXCLUDED."source",
              "inactivity" = "HourlyValidatorStats"."inactivity" + EXCLUDED."inactivity"
          `;
        }

        // Update epoch status within the same transaction
        await tx.epoch.update({
          where: { epoch: epochNumber },
          data: { rewardsFetched: true },
        });
      },
      {
        timeout: ms("1m"),
      }
    );

    logger.info(`Rewards data for epoch ${epochNumber} processed successfully`);
  } catch (error) {
    if (error.message.includes("404 - Aborting")) {
      logger.info(`404 - Aborting`);
      return;
    }
    logger.error(
      `Error fetching or inserting beacon rewards for epoch ${epochNumber}`,
      error
    );
  }
}
