import { Prisma } from '@prisma/client';
import chunk from 'lodash/chunk.js';
import ms from 'ms';

import { getAttestationRewards } from '@/src/beacon/endpoints.js';
import { getTimestampFromEpochNumber } from '@/src/beacon/utils/time.js';
import { createEpoch } from '@/src/feed/utils.js';
import { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';
import { convertToUTC } from '@/src/utils/date/index.js';

const prisma = getPrisma();

export async function fetchBeaconRewards(epoch: number, logger: CustomLogger) {
  try {
    logger.info(`Processing epoch ${epoch}`);

    // Create epoch record in db if it doesn't exist
    await createEpoch(epoch);

    // fetch beacon node to get the attestation rewards for all the validators
    const response = await getAttestationRewards(epoch, []);

    const epochTimestamp = getTimestampFromEpochNumber(epoch);
    const { date, hour } = convertToUTC(epochTimestamp);

    // Process rewards data
    const rewardsData = response.data.total_rewards.map((validatorInfo) => ({
      validatorIndex: Number(validatorInfo.validator_index),
      epoch: epoch,
      head: BigInt(validatorInfo.head || '0'),
      target: BigInt(validatorInfo.target || '0'),
      source: BigInt(validatorInfo.source || '0'),
      inactivity: BigInt(validatorInfo.inactivity || '0'),
    }));

    await prisma.$transaction(
      async (tx) => {
        // Create temporary table to store rewards data
        await tx.$executeRaw`
          CREATE TEMPORARY TABLE temp_validator_stats (
            LIKE "HourlyValidatorStats" INCLUDING ALL
          ) ON COMMIT DROP
        `;

        // Insert rewards data into temporary table in batches
        const batches = chunk(rewardsData, 250000);
        const batchPromises = batches.map((batch) => {
          const values = batch
            .map(
              (reward) =>
                `(${reward.validatorIndex}, ${hour}, '${date}', ${reward.head}, ${reward.target}, ${reward.source}, ${reward.inactivity})`,
            )
            .join(',');

          return tx.$executeRaw`
            INSERT INTO temp_validator_stats VALUES ${Prisma.raw(values)}
          `;
        });
        await Promise.all(batchPromises);

        // merge temporary table with main table
        await tx.$executeRaw`
          INSERT INTO "HourlyValidatorStats"
          SELECT * FROM temp_validator_stats
          ON CONFLICT ("validatorIndex", "hour", "date") 
          DO UPDATE SET
            "head" = "HourlyValidatorStats"."head" + EXCLUDED."head",
            "target" = "HourlyValidatorStats"."target" + EXCLUDED."target",
            "source" = "HourlyValidatorStats"."source" + EXCLUDED."source",
            "inactivity" = "HourlyValidatorStats"."inactivity" + EXCLUDED."inactivity",
            "syncCommittee" = COALESCE("HourlyValidatorStats"."syncCommittee", 0),
            "blockReward" = COALESCE("HourlyValidatorStats"."blockReward", 0)
        `;

        // TODO: This seems to be unnecessary.
        // was added to do some debugging and seems it was forgotten to be removed.

        // check if rewards was fetched for this epoch
        // const dbEpoch = await tx.epoch.findUnique({
        //   where: { epoch },
        // });

        // if (dbEpoch.rewardsFetched) {
        //   logger.warn(`Rewards already fetched for epoch ${epoch}`);
        //   return;
        // }

        // Update epoch status
        await tx.epoch.update({
          where: { epoch },
          data: { rewardsFetched: true },
        });
      },
      {
        timeout: ms('10m'),
      },
    );
    logger.info(`Done.`);
  } catch (error) {
    // TODO: this seems to be unnecessary.
    // if (error.message.includes("404 - Aborting")) {
    //   logger.error(error.message, error);
    //   return;
    // }
    logger.error(`Error fetching or inserting beacon rewards for epoch ${epoch}`, error);
  }
}
