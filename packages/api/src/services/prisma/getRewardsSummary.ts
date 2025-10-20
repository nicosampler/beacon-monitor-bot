import { PrismaClient } from '@prisma/client';
import { formatUnits } from 'viem';

import { getPrisma } from '@/src/lib/prisma.js';
import { ValidatorRewards, MonthlyTotals } from '@/src/routes/types.js';

export type RewardsSummaryData = {
  validators: ValidatorRewards[];
  monthly_totals: MonthlyTotals;
};

// Constants for reward conversion (aligned with existing codebase)
const scale = BigInt(10) ** BigInt(18); // 10^18 to convert to wei
const tokenUnit = BigInt(32000000000); // 32 gwei base unit

// Helper function to parse month and get date strings
function getMonthDateStrings(month: string): { startDateStr: string; endDateStr: string } {
  const [year, monthNum] = month.split('-').map(Number);
  const endDate = new Date(Date.UTC(year, monthNum, 0)); // Last day of the month

  const startDateStr = `${year}-${monthNum.toString().padStart(2, '0')}-01`;
  const endDateStr = `${year}-${monthNum.toString().padStart(2, '0')}-${endDate.getUTCDate().toString().padStart(2, '0')}`;

  return { startDateStr, endDateStr };
}

// Helper function to get consensus layer rewards
async function getConsensusRewards(
  prisma: PrismaClient,
  withdrawalAddresses: string[],
  startDateStr: string,
  endDateStr: string,
) {
  const withdrawalAddressesStr = withdrawalAddresses.map((addr) => `'${addr}'`).join(',');
  const consensusQuery = `
    SELECT 
      dvs."validatorIndex",
      dvs.date,
      COALESCE(dvs.head, 0) as head,
      COALESCE(dvs.target, 0) as target,
      COALESCE(dvs.source, 0) as source,
      COALESCE(dvs.inactivity, 0) as inactivity,
      COALESCE(dvs."syncCommittee", 0) as "syncCommittee",
      COALESCE(dvs."blockReward", 0) as "blockReward"
    FROM "DailyValidatorStats" dvs
    JOIN "Validator" v ON v.id = dvs."validatorIndex"
    WHERE v."withdrawalAddress" IN (${withdrawalAddressesStr})
      AND dvs.date >= '${startDateStr}'
      AND dvs.date <= '${endDateStr}'
    ORDER BY dvs."validatorIndex", dvs.date
  `;

  return (await prisma.$queryRawUnsafe(consensusQuery)) as {
    validatorIndex: number;
    date: Date;
    head: string;
    target: string;
    source: string;
    inactivity: string;
    syncCommittee: string;
    blockReward: string;
  }[];
}

// Helper function to get execution layer rewards
async function getExecutionRewards(
  prisma: PrismaClient,
  executionAddresses: string[],
  startDateStr: string,
  endDateStr: string,
) {
  const executionAddressesStr = executionAddresses.map((addr) => `'${addr}'`).join(',');
  const executionQuery = `
    SELECT 
      date,
      COALESCE(SUM(amount), 0) as total
    FROM "DailyExecutionRewards" der
    WHERE der.address IN (${executionAddressesStr})
      AND der.date >= '${startDateStr}'
      AND der.date <= '${endDateStr}'
    GROUP BY date
    ORDER BY date
  `;

  return (await prisma.$queryRawUnsafe(executionQuery)) as {
    date: Date;
    total: string;
  }[];
}

// Helper function to initialize validator rewards map
function initializeValidatorRewardsMap(validatorIndexes: number[]): Map<number, ValidatorRewards> {
  const validatorRewardsMap = new Map<number, ValidatorRewards>();

  for (const validatorIndex of validatorIndexes) {
    validatorRewardsMap.set(validatorIndex, {
      validator_index: validatorIndex,
      execution_layer_rewards: {
        by_day: {},
        monthly_total: 0,
      },
      consensus_layer_rewards: {
        by_day: {},
        monthly_total: 0,
      },
    });
  }

  return validatorRewardsMap;
}

// Helper function to process consensus layer rewards
function processConsensusRewards(
  consensusRewards: {
    validatorIndex: number;
    date: Date;
    head: string;
    target: string;
    source: string;
    inactivity: string;
    syncCommittee: string;
    blockReward: string;
  }[],
  validatorRewardsMap: Map<number, ValidatorRewards>,
) {
  for (const reward of consensusRewards) {
    const validator = validatorRewardsMap.get(reward.validatorIndex);
    if (!validator) continue;

    const dateStr = reward.date.toISOString().split('T')[0]; // YYYY-MM-DD format (UTC)

    // Calculate total consensus rewards for this day (convert from gwei to ETH)
    const totalConsensus =
      BigInt(reward.head) +
      BigInt(reward.target) +
      BigInt(reward.source) +
      BigInt(reward.inactivity) +
      BigInt(reward.syncCommittee) +
      BigInt(reward.blockReward);

    const totalConsensusInWei = (totalConsensus * scale) / tokenUnit;
    const dailyTotal = Number(formatUnits(totalConsensusInWei, 18));

    validator.consensus_layer_rewards.by_day[dateStr] = dailyTotal;
    validator.consensus_layer_rewards.monthly_total += dailyTotal;
  }
}

// Helper function to process execution layer rewards
function processExecutionRewards(
  executionRewards: {
    date: Date;
    total: string;
  }[],
  validatorRewardsMap: Map<number, ValidatorRewards>,
) {
  const executionRewardsByDay = new Map<string, number>();

  // Collect execution rewards by day
  for (const reward of executionRewards) {
    const dateStr = reward.date.toISOString().split('T')[0]; // YYYY-MM-DD format (UTC)
    // For Gnosis: values are stored with 18 decimals, use formatUnits with 18 decimals
    const amount = Number(formatUnits(BigInt(reward.total), 18));
    executionRewardsByDay.set(dateStr, amount);
  }

  // Distribute execution rewards equally among validators
  const validatorCount = validatorRewardsMap.size;
  for (const [dateStr, totalAmount] of executionRewardsByDay) {
    const amountPerValidator = totalAmount / validatorCount;

    for (const validator of validatorRewardsMap.values()) {
      validator.execution_layer_rewards.by_day[dateStr] = amountPerValidator;
      validator.execution_layer_rewards.monthly_total += amountPerValidator;
    }
  }
}

// Helper function to calculate monthly totals
function calculateMonthlyTotals(validatorRewardsMap: Map<number, ValidatorRewards>): MonthlyTotals {
  const monthlyTotals: MonthlyTotals = {
    execution_layer: 0,
    consensus_layer: 0,
  };

  for (const validator of validatorRewardsMap.values()) {
    monthlyTotals.consensus_layer += validator.consensus_layer_rewards.monthly_total;
    monthlyTotals.execution_layer += validator.execution_layer_rewards.monthly_total;
  }

  return monthlyTotals;
}

export async function getRewardsSummary(
  withdrawalAddresses: string[],
  month: string, // YYYY-MM format
  feeRewardAddresses?: string[],
): Promise<RewardsSummaryData> {
  const prisma = getPrisma();
  const { startDateStr, endDateStr } = getMonthDateStrings(month);

  // Get consensus and execution rewards
  const [consensusRewards, executionRewards] = await Promise.all([
    getConsensusRewards(prisma, withdrawalAddresses, startDateStr, endDateStr),
    getExecutionRewards(
      prisma,
      feeRewardAddresses || withdrawalAddresses,
      startDateStr,
      endDateStr,
    ),
  ]);

  // Get unique validators from consensus rewards
  const uniqueValidators = new Set(consensusRewards.map((r) => r.validatorIndex));

  if (uniqueValidators.size === 0) {
    return {
      validators: [],
      monthly_totals: {
        execution_layer: 0,
        consensus_layer: 0,
      },
    };
  }

  // Initialize and process rewards
  const validatorRewardsMap = initializeValidatorRewardsMap(
    Array.from(uniqueValidators) as number[],
  );

  processConsensusRewards(consensusRewards, validatorRewardsMap);
  processExecutionRewards(executionRewards, validatorRewardsMap);

  const monthlyTotals = calculateMonthlyTotals(validatorRewardsMap);

  return {
    validators: Array.from(validatorRewardsMap.values()),
    monthly_totals: monthlyTotals,
  };
}
