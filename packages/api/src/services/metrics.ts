import memoizee from 'memoizee';
import ms from 'ms';
import { formatEther } from 'viem';

import { env } from '@/src/env.js';
import { getPrisma } from '@/src/lib/prisma.js';
import {
  MetricsResponse,
  WithdrawalAddressStats,
  WithdrawalAddressStatsResponse,
} from '@/src/routes/types.js';
import { getTokenPrice } from '@/src/services/tokenPrice.js';

// 1 token = 1e9 gWei
const gWei = BigInt(10) ** BigInt(9);
// 1 GNO = 32 mGNO, 1 ETH = 1 ETH
const tokenMultiplier = env.NODE_SENTINEL_CHAIN === 'gnosis' ? BigInt(32) : BigInt(1);

async function getMetricsImpl(): Promise<MetricsResponse> {
  const prisma = getPrisma();

  // Get user count - only users with at least 1 active validator
  const userCountResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT u.id) as count
    FROM "User" u
    INNER JOIN "_UserToValidator" uv ON u.id = uv."A"
    INNER JOIN "Validator" v ON uv."B" = v.id
    WHERE u."hasBlockedBot" = false
      AND v.status IN (1, 2, 3)
  `;
  const userCount = Number(userCountResult[0]?.count || 0);

  // Use raw query to avoid bind variable limit
  const validatorsData = await prisma.$queryRaw<Array<{ id: number; balance: string }>>`
    SELECT DISTINCT
      v.id,
      v.balance
    FROM "User" u
    INNER JOIN "_UserToValidator" uv ON u.id = uv."A"
    INNER JOIN "Validator" v ON uv."B" = v.id
    WHERE u."hasBlockedBot" = false
      AND v.status IN (1, 2, 3)
    ORDER BY v.id ASC
  `;

  const uniqueValidatorCount = validatorsData.length;

  // Calculate total balance from unique validators
  const totalBalanceInGwei = validatorsData.reduce(
    (acc, validator) => acc + BigInt(validator.balance),
    BigInt(0),
  );

  // Convert to tokens using the same logic as in notifyUserStatsMessage.ts
  const totalBalanceInWei = (totalBalanceInGwei * gWei) / tokenMultiplier;
  const totalBalanceInTokens = Number(formatEther(totalBalanceInWei));

  // Get current token price
  const tokenPriceUsd = await getTokenPrice();

  // Calculate USD value
  const totalBalanceUsd = totalBalanceInTokens * tokenPriceUsd;

  // Calculate total active validators for coverage percentage
  const totalActiveValidatorsResult = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
    SELECT COUNT(*) as count
    FROM "Validator" v
    WHERE v.status IN (1, 2, 3)
  `);

  const totalActiveValidators = Number(totalActiveValidatorsResult[0]?.count || 0);
  const coveragePercentage =
    totalActiveValidators > 0 ? (uniqueValidatorCount / totalActiveValidators) * 100 : 0;

  return {
    users: {
      total: userCount,
    },
    validators: {
      total: uniqueValidatorCount,
    },
    balance: {
      total: totalBalanceInTokens.toFixed(6),
      usd: totalBalanceUsd.toFixed(2),
    },
    tokenPrice: {
      usd: tokenPriceUsd,
    },
    coverage: {
      total_percentage: Math.round(coveragePercentage * 100) / 100,
    },
  };
}

// Memoize the function with a 1-hour TTL
export const getMetrics = memoizee(getMetricsImpl, {
  promise: true, // Handle async function
  maxAge: ms('1h'), // 1 hour in milliseconds
  preFetch: true, // Start fetching new value before cache expires
  primitive: true, // No complex cache key comparison needed
});

export async function getWithdrawalAddressStats(): Promise<WithdrawalAddressStatsResponse> {
  const prisma = getPrisma();

  const ranges = [
    { min: 1, max: 10, label: '1:10' },
    { min: 11, max: 20, label: '11:20' },
    { min: 21, max: 50, label: '21:50' },
    { min: 51, max: 100, label: '51:100' },
    { min: 101, max: 250, label: '101:250' },
    { min: 251, max: 500, label: '251:500' },
    { min: 501, max: 1000, label: '501:1000' },
    { min: 1001, max: 2000, label: '1001:2000' },
    { min: 2001, max: null, label: '>2000' },
    // { min: 2001, max: 3000, label: '2001:3000' },
    // { min: 3001, max: 5000, label: '3001:5000' },
    // { min: 5001, max: 10000, label: '5001:10000' },
    // { min: 10001, max: null, label: '>10000' },
  ];

  const results: WithdrawalAddressStats[] = [];

  for (const range of ranges) {
    const havingCondition = range.max
      ? `HAVING COUNT(v.id) BETWEEN ${range.min} AND ${range.max}`
      : `HAVING COUNT(v.id) > ${range.min - 1}`;

    const chainSql = `
      SELECT COUNT(*) as count
      FROM (
        SELECT 
          v."withdrawalAddress"
        FROM "Validator" v
        WHERE v."withdrawalAddress" IS NOT NULL
          AND v.status IN (1, 2, 3)
        GROUP BY v."withdrawalAddress"
        ${havingCondition}
      ) subquery
    `;

    const nodeSentinelSql = `
      SELECT COUNT(*) as count
      FROM (
        SELECT 
          v."withdrawalAddress"
        FROM "User" u
        LEFT JOIN "_UserToValidator" uv ON u.id = uv."A"
        LEFT JOIN "Validator" v ON uv."B" = v.id
        WHERE u."hasBlockedBot" = false
          AND v."withdrawalAddress" IS NOT NULL
          AND v.status IN (1, 2, 3)
        GROUP BY v."withdrawalAddress"
        ${havingCondition}
      ) subquery
    `;

    const chainResult = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(chainSql);
    const nodeSentinelResult =
      await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(nodeSentinelSql);

    const chainCount = Number(chainResult[0]?.count || 0);
    const nodeSentinelCount = Number(nodeSentinelResult[0]?.count || 0);
    const percentage = chainCount > 0 ? (nodeSentinelCount / chainCount) * 100 : 0;

    results.push({
      range: range.label,
      total_wa: chainCount,
      node_sentinel_wa: nodeSentinelCount,
      node_sentinel_percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
    });
  }

  // Calculate withdrawal address coverage
  const totalWithdrawalAddressesResult = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
    SELECT COUNT(DISTINCT v."withdrawalAddress") as count
    FROM "Validator" v
    WHERE v."withdrawalAddress" IS NOT NULL
      AND v.status IN (1, 2, 3)
  `);

  const nodeSentinelWithdrawalAddressesResult = await prisma.$queryRawUnsafe<
    Array<{ count: bigint }>
  >(`
    SELECT COUNT(DISTINCT v."withdrawalAddress") as count
    FROM "User" u
    INNER JOIN "_UserToValidator" uv ON u.id = uv."A"
    INNER JOIN "Validator" v ON uv."B" = v.id
    WHERE u."hasBlockedBot" = false
      AND v."withdrawalAddress" IS NOT NULL
      AND v.status IN (1, 2, 3)
  `);

  const totalWithdrawalAddresses = Number(totalWithdrawalAddressesResult[0]?.count || 0);
  const nodeSentinelWithdrawalAddresses = Number(
    nodeSentinelWithdrawalAddressesResult[0]?.count || 0,
  );
  const withdrawalAddressCoveragePercentage =
    totalWithdrawalAddresses > 0
      ? (nodeSentinelWithdrawalAddresses / totalWithdrawalAddresses) * 100
      : 0;

  return {
    ranges: results,
    withdrawal_address: {
      total: totalWithdrawalAddresses,
      in_node_sentinel: nodeSentinelWithdrawalAddresses,
      percentage: Math.round(withdrawalAddressCoveragePercentage * 100) / 100,
    },
  };
}
