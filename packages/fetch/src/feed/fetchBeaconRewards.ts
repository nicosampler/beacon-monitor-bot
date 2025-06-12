import { Prisma } from '@prisma/client';
import chunk from 'lodash/chunk.js';
import ms from 'ms';

import { beacon_getAttestationRewards } from '@/src/beacon/endpoints.js';
import { AttestationRewards } from '@/src/beacon/types.js';
import { getTimestampFromEpochNumber } from '@/src/beacon/utils/time.js';
import {
  db_getValidatorsIdsToFetchInfo,
  db_getValidatorsEffectiveBalances,
} from '@/src/feed/utils.js';
import { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';
import { convertToUTC } from '@/src/utils/date/index.js';

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
    logger.info(`Fetching rewards.`);

    const epochTimestamp = getTimestampFromEpochNumber(epoch);
    const { date, hour } = convertToUTC(epochTimestamp);

    // 1. Truncate temp table
    await truncateTempTable();

    // Get all validator ids to fetch info
    const allValidatorIds = await db_getValidatorsIdsToFetchInfo();
    let idealRewardsMap: Map<string, AttestationRewards['data']['ideal_rewards'][number]> | null =
      null;

    // Process all validators in batches
    const validatorBatches = chunk(allValidatorIds, 1000000);
    allValidatorIds.length = 0;

    // 2. Load data into temp table
    for (const batch of validatorBatches) {
      // Get effective balances for the validators in the batch
      const validatorsEffectiveBalances = await db_getValidatorsEffectiveBalances(batch);
      const validatorsBalancesMap = new Map(
        validatorsEffectiveBalances.map((balance) => [
          balance.id.toString(),
          balance.effectiveBalance?.toString() || '0',
        ]),
      );
      validatorsEffectiveBalances.length = 0;

      // Get attestation rewards for this batch
      const epochRewards = await beacon_getAttestationRewards(epoch, batch);

      // Create ideal rewards map if this is the first batch
      if (!idealRewardsMap) {
        idealRewardsMap = createIdealRewardsMap(epochRewards);
      }

      // Save rewards data in temp table
      const rewardBatches = chunk(epochRewards.data.total_rewards, 12_000);
      for (const rewardBatch of rewardBatches) {
        await insertBatchIntoTempTable(
          rewardBatch,
          validatorsBalancesMap,
          idealRewardsMap!,
          date,
          hour,
        );
      }
      batch.length = 0;
    }

    // 3. Execute merge and update in a transaction
    await prisma.$transaction(
      async (tx) => {
        await mergeAndUpdateEpoch(tx, epoch);
      },
      {
        timeout: ms('3m'),
      },
    );

    // 4. Final truncate if everything went well
    await truncateTempTable();

    logger.info(
      `All Epoch rewards processed in ${((Date.now() - start) / 1000 / 60).toFixed(2)} minutes`,
    );
  } catch (error) {
    logger.error('Error processing rewards:', error);
    throw error;
  }
}
