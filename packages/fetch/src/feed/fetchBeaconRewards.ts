import { Prisma } from '@prisma/client';
import chunk from 'lodash/chunk.js';
import mergeWith from 'lodash/mergeWith.js';
import ms from 'ms';

import { getAttestationRewards } from '@/src/beacon/endpoints.js';
import { AttestationRewards } from '@/src/beacon/types.js';
import { getTimestampFromEpochNumber } from '@/src/beacon/utils/time.js';
import { getAttestingValidatorIds, getHighestValidatorId } from '@/src/feed/utils.js';
import { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';
import { convertToUTC } from '@/src/utils/date/index.js';

const prisma = getPrisma();

export async function fetchBeaconRewards(epoch: number, logger: CustomLogger) {
  try {
    logger.info(`Processing epoch ${epoch}`);

    //Get all validator IDs that are not in final states
    const highestValidatorId = await getHighestValidatorId();
    const allValidatorIds = await getAttestingValidatorIds(highestValidatorId);
    //fetch beacon node to get the attestation rewards for all the validators in batches
    const validatorBatches = chunk(allValidatorIds, 100000);
    let response: AttestationRewards = {
      execution_optimistic: false,
      data: { ideal_rewards: [], total_rewards: [] },
    };
    for (const batch of validatorBatches) {
      const batchResponse = await getAttestationRewards(epoch, batch);
      response = mergeWith(response, batchResponse, (currentValue, newValue, key) =>
        // we only merge total_rewards as ideal_rewards are always the same for the whole epoch
        key === 'total_rewards' ? currentValue.concat(newValue) : undefined,
      );
    }

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
            INSERT INTO temp_validator_stats (
              "validatorIndex",
              "hour",
              "date",
              "head",
              "target",
              "source",
              "inactivity"
            ) VALUES ${Prisma.raw(values)}
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
            "inactivity" = "HourlyValidatorStats"."inactivity" + EXCLUDED."inactivity"
        `;

        // Update epoch status
        await tx.epoch.upsert({
          where: { epoch },
          update: { rewardsFetched: true },
          create: { epoch, rewardsFetched: true },
        });
      },
      {
        timeout: ms('10m'),
      },
    );
    logger.info(`Done.`);
  } catch (error) {
    logger.error(`Error fetching or inserting beacon rewards for epoch ${epoch}`, error);
  }
}
