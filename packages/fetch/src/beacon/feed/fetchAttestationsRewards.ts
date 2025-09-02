import { Prisma } from '@prisma/client';
import chunk from 'lodash/chunk.js';
import ms from 'ms';

import { beacon_getAttestationRewards } from '@/src/beacon/endpoints.js';
import { AttestationRewards } from '@/src/beacon/types.js';
import { getTimestampFromEpochNumber } from '@/src/beacon/utils/time.js';
import { getPrisma } from '@/src/lib/prisma.js';
import { convertToUTC } from '@/src/utils/date/index.js';
import { db_getAttestingValidatorsIds, db_getValidatorsEffectiveBalances } from '@/src/utils/db.js';

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

async function processTmpTableAndUpdateEpoch(
  tx: Prisma.TransactionClient,
  epoch: number,
): Promise<void> {
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
export async function fetchAttestationsRewards(epoch: number) {
  try {
    const epochTimestamp = getTimestampFromEpochNumber(epoch);
    const { date, hour } = convertToUTC(epochTimestamp);

    // Truncate temp table
    await truncateTempTable();

    // Get all validator in non final states fetch info
    const allValidatorIds = await db_getAttestingValidatorsIds();
    let idealRewardsMap: Map<string, AttestationRewards['data']['ideal_rewards'][number]> | null =
      null;

    // split all validators in batches
    const validatorBatches = chunk(allValidatorIds, 1000000);
    allValidatorIds.length = 0;

    // Fetch rewards in batches and save in a temp table
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

      // fetch the beacon chain to get the rewards for this batch
      const epochRewards = await beacon_getAttestationRewards(epoch, batch);

      // Create ideal-rewards map if this is the first batch
      // ideal-rewards is for the epoch, so we only need to do it once
      if (!idealRewardsMap) {
        idealRewardsMap = createIdealRewardsMap(epochRewards);
      }

      // Save rewards in a temp table
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

    // process tmb results and combine them in the main table
    // also mark the epoch as rewards fetched
    await prisma.$transaction(
      async (tx) => {
        await processTmpTableAndUpdateEpoch(tx, epoch);
      },
      {
        timeout: ms('3m'),
      },
    );
  } catch (error) {
    console.error('Error processing rewards:', error);
    throw error;
  }
}
