import { getAttestationRewards } from "@/src/beacon/endpoints.js";
import { CustomLogger } from "@/src/lib/pino.js";
import { getHighestValidatorId } from "@/src/feed/utils.js";
import chunk from "lodash/chunk.js";
import { VALIDATOR_STATUS } from "@/src/constants/index.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { Prisma } from "@prisma/client";
import { getTimestampFromEpochNumber } from "@/src/beacon/utils/time.js";
import { convertToUTC } from "@/src/utils/date/index.js";

const prisma = getPrisma();
const apiBatchSize = 150000;
const prismaBatchSize = 2500;

export async function fetchBeaconRewards(
  epochNumber: number,
  logger: CustomLogger
) {
  try {
    const highestValidatorId = await getHighestValidatorId();

    // Fetch validator IDs that are active and ongoing or pending queued
    const activeValidators = await prisma.validator.findMany({
      where: {
        status: {
          in: [
            VALIDATOR_STATUS.ACTIVE_ONGOING,
            VALIDATOR_STATUS.PENDING_QUEUED,
          ],
        },
      },
      select: { id: true },
    });
    const activeValidatorsIds = new Set(activeValidators.map((v) => v.id));

    const allValidatorIds = Array.from(
      { length: highestValidatorId + 1 },
      (_, i) => i
    )
      .filter((id) => activeValidatorsIds.has(id)) // filter out inactive validators
      .map((id) => id.toString());

    // using createMany to be able to skip duplicates
    await prisma.epoch.createMany({
      data: [{ epoch: epochNumber, rewardsFetched: false }],
      skipDuplicates: true,
    });

    // fetch rewards for each validator in batches
    const validatorIdBatches = chunk(allValidatorIds, apiBatchSize);
    for (const validatorIds of validatorIdBatches) {
      const validatorsRewardsRes = await getAttestationRewards(
        epochNumber,
        validatorIds
      );

      // if returns 404, abort the loop as the epoch is not finalized yet
      if (validatorsRewardsRes.status === 404) {
        throw new Error("404 - Aborting");
      }

      const rewardsData = validatorsRewardsRes.data.data.total_rewards.map(
        (validatorInfo) => ({
          validatorIndex: parseInt(validatorInfo.validator_index),
          epoch: epochNumber,
          head: BigInt(validatorInfo.head || "0"),
          target: BigInt(validatorInfo.target || "0"),
          source: BigInt(validatorInfo.source || "0"),
          inactivity: BigInt(validatorInfo.inactivity || "0"),
        })
      );

      const rewardsDataBatches = chunk(rewardsData, prismaBatchSize);
      for (const batch of rewardsDataBatches) {
        const epochTimestamp = getTimestampFromEpochNumber(epochNumber);
        const { date, hour } = convertToUTC(epochTimestamp);

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
    }

    await prisma.epoch.update({
      where: { epoch: epochNumber },
      data: { rewardsFetched: true },
    });

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
