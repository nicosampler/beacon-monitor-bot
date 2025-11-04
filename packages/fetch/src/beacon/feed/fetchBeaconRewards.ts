import { Prisma } from '@prisma/client';
import chunk from 'lodash/chunk.js';
import ms from 'ms';

import { beacon_getAttestationRewards } from '@/src/beacon/endpoints.js';
import { AttestationRewards } from '@/src/beacon/types.js';
import { getTimestampFromEpochNumber } from '@/src/beacon/utils/time.js';
import { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';
import { convertToUTC } from '@/src/utils/date/index.js';
import { db_getAttestingValidatorsWithBalances } from '@/src/utils/db.js';

const prisma = getPrisma();

// Helper functions
function createIdealRewardsMap(
  epochRewards: AttestationRewards,
): Map<string, AttestationRewards['data']['ideal_rewards'][number]> {
  return new Map(
    epochRewards.data.ideal_rewards.map((reward) => [reward.effective_balance, reward]),
  );
}

function formatValidatorReward(
  validatorInfo: AttestationRewards['data']['total_rewards'][number],
  effectiveBalance: string,
  idealRewards: AttestationRewards['data']['ideal_rewards'][number],
  date: string,
  hour: number,
): string {
  if (effectiveBalance === '0') {
    return `(${Number(validatorInfo.validator_index)}, '${date}', ${hour}, 0, 0, 0, 0)`;
  }

  const head = BigInt(validatorInfo.head || '0');
  const target = BigInt(validatorInfo.target || '0');
  const source = BigInt(validatorInfo.source || '0');
  const inactivity = BigInt(validatorInfo.inactivity || '0');

  return `(${Number(validatorInfo.validator_index)}, '${date}', ${hour}, ${head}, ${target}, ${source}, ${inactivity})`;
}

// Database operations
async function truncateTempTable(): Promise<void> {
  await prisma.$executeRaw`TRUNCATE TABLE "EpochRewardsTemp"`;
}

async function insertBatchIntoTempTable(
  batch: AttestationRewards['data']['total_rewards'],
  validatorsBalancesMap: Map<string, string>,
  idealRewardsMap: Map<string, AttestationRewards['data']['ideal_rewards'][number]>,
  date: string,
  hour: number,
): Promise<void> {
  const values = batch
    .map((validatorInfo) => {
      const effectiveBalance = validatorsBalancesMap.get(validatorInfo.validator_index) || '0';
      const idealRewards = idealRewardsMap.get(effectiveBalance)!;
      return formatValidatorReward(validatorInfo, effectiveBalance, idealRewards, date, hour);
    })
    .join(',');

  await prisma.$executeRaw`
    INSERT INTO "EpochRewardsTemp" 
      ("validatorIndex", "date", "hour", "head", "target", "source", "inactivity")
    VALUES ${Prisma.raw(values)}
  `;
}

/**
 * Processes batches of validator IDs in parallel with a concurrency limit.
 * Fetches attestation rewards for multiple batches concurrently.
 */
async function fetchAttestationRewardsInParallel(
  epoch: number,
  validatorIds: number[],
  logger: CustomLogger,
): Promise<AttestationRewards[]> {
  const concurrency = 10;
  const validatorBatches = chunk(validatorIds, 150000);

  const allResults: AttestationRewards[] = [];

  // Process batches in chunks of concurrency limit
  for (let i = 0; i < validatorBatches.length; i += concurrency) {
    const batchChunk = validatorBatches.slice(i, i + concurrency);

    const promises = batchChunk.map((batch) =>
      beacon_getAttestationRewards(epoch, batch).catch((error) => {
        logger.error(
          `Error fetching attestation rewards for batch of ${batch.length} validators:`,
          error,
        );
        throw error;
      }),
    );

    const results = await Promise.all(promises);
    allResults.push(...results);
  }

  return allResults;
}

async function mergeAndUpdateEpoch(tx: Prisma.TransactionClient, epoch: number): Promise<void> {
  // Merge data from temporary table to main table
  await tx.$executeRaw`
    INSERT INTO "HourlyValidatorStats" 
      ("validatorIndex", "date", "hour", "head", "target", "source", "inactivity")
    SELECT 
      "validatorIndex", "date", "hour", "head", "target", "source", "inactivity"
    FROM "EpochRewardsTemp"
    ON CONFLICT ("validatorIndex", "date", "hour") DO UPDATE SET
      "head" = COALESCE("HourlyValidatorStats"."head", 0) + COALESCE(EXCLUDED."head", 0),
      "target" = COALESCE("HourlyValidatorStats"."target", 0) + COALESCE(EXCLUDED."target", 0),
      "source" = COALESCE("HourlyValidatorStats"."source", 0) + COALESCE(EXCLUDED."source", 0),
      "inactivity" = COALESCE("HourlyValidatorStats"."inactivity", 0) + COALESCE(EXCLUDED."inactivity", 0)
  `;

  // Update epoch status
  await tx.epoch.update({
    where: { epoch },
    data: { rewardsFetched: true },
  });
}

// Main function
export async function fetchBeaconRewards(logger: CustomLogger, epoch: number) {
  const start = Date.now();
  try {
    logger.info(`Fetching rewards for epoch ${epoch}.`);

    const epochTimestamp = getTimestampFromEpochNumber(epoch);
    const { date, hour } = convertToUTC(epochTimestamp);

    // 1. Truncate temp table
    await truncateTempTable();

    // 2. Get all validator IDs and their effective balances
    logger.info(`Getting all attesting validator IDs and effective balances.`);
    const validatorsWithBalances = await db_getAttestingValidatorsWithBalances();
    logger.info(`Found ${validatorsWithBalances.length} attesting validators.`);

    // Build Map only once when we have all data
    // Convert Decimal to string here (avoiding expensive text casting in SQL)
    const validatorsBalancesMap = new Map<string, string>();
    const allValidatorIds: number[] = [];
    for (const validator of validatorsWithBalances) {
      allValidatorIds.push(validator.id);
      // Convert Decimal to string efficiently - Prisma Decimal has toString() method
      const balanceStr = validator.effectiveBalance?.toString() || '0';
      validatorsBalancesMap.set(validator.id.toString(), balanceStr);
    }
    validatorsWithBalances.length = 0; // Free memory

    // 3. Split validators into batches for parallel fetching
    logger.info(`Fetching attestation rewards in parallel batches.`);
    const allEpochRewards = await fetchAttestationRewardsInParallel(epoch, allValidatorIds, logger);

    // 5. Create ideal rewards map from first response
    const idealRewardsMap = createIdealRewardsMap(allEpochRewards[0]);

    // 6. Insert all rewards data into temp table
    logger.info(`Inserting all rewards data into temp table.`);
    for (const epochRewards of allEpochRewards) {
      // Save rewards data in temp table in smaller batches
      const rewardBatches = chunk(epochRewards.data.total_rewards, 12_000);
      for (const rewardBatch of rewardBatches) {
        await insertBatchIntoTempTable(
          rewardBatch,
          validatorsBalancesMap,
          idealRewardsMap,
          date,
          hour,
        );
      }
    }

    // 7. Merge data from temp table to main table and update epoch status
    logger.info(`Merging data from temp table to main table.`);
    await prisma.$transaction(
      async (tx) => {
        await mergeAndUpdateEpoch(tx, epoch);
        await prisma.epoch.update({
          where: { epoch },
          data: { rewardsFetched: true },
        });
      },
      {
        timeout: ms('3m'),
      },
    );

    logger.info(
      `All Epoch rewards processed in ${((Date.now() - start) / 1000 / 60).toFixed(2)} minutes`,
    );
  } catch (error) {
    logger.error('Error processing rewards:', error);
    throw error;
  }
}
