import { formatEther } from 'viem';

import { getTokenPrice } from './tokenPrice.js';

import { env } from '@/src/env.js';
import { getPrisma } from '@/src/lib/prisma.js';

// 1 token = 1e9 gWei
const gWei = BigInt(10) ** BigInt(9);
// 1 GNO = 32 mGNO, 1 ETH = 1 ETH
const tokenMultiplier = env.NODE_SENTINEL_CHAIN === 'gnosis' ? BigInt(32) : BigInt(1);

interface ChainStatisticsResult {
  joining: bigint;
  active: bigint;
  leaving: bigint;
  joining_balance_gwei: string;
  active_balance_gwei: string;
  leaving_balance_gwei: string;
}

export interface ChainStatistics {
  joining: {
    count: number;
    balance: {
      tokens: string;
      usd: string;
      symbol: string;
    };
  };
  active: {
    count: number;
    balance: {
      tokens: string;
      usd: string;
      symbol: string;
    };
  };
  leaving: {
    count: number;
    balance: {
      tokens: string;
      usd: string;
      symbol: string;
    };
  };
  tokenPrice: {
    usd: number;
  };
  timestamp: string;
}

export async function getChainStatistics(): Promise<ChainStatistics> {
  const prisma = getPrisma();

  // Use a single raw query for maximum performance
  const result = await prisma.$queryRaw<ChainStatisticsResult[]>`
    SELECT 
      SUM(CASE WHEN status IN (0,1) THEN 1 ELSE 0 END)::bigint AS joining,
      SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END)::bigint AS active,
      SUM(CASE WHEN status IN (3, 4) THEN 1 ELSE 0 END)::bigint AS leaving,
      COALESCE(SUM(CASE WHEN status IN (0,1) THEN balance ELSE 0 END), 0)::text AS joining_balance_gwei,
      COALESCE(SUM(CASE WHEN status = 2 THEN balance ELSE 0 END), 0)::text AS active_balance_gwei,
      COALESCE(SUM(CASE WHEN status IN (3, 4) THEN balance ELSE 0 END), 0)::text AS leaving_balance_gwei
    FROM "Validator"
  `;

  const data = result[0];

  // Get current token price
  const tokenPriceUsd = await getTokenPrice();

  // Helper function to convert balance from gwei to tokens and USD
  const convertBalance = (balanceGwei: string) => {
    const totalBalanceInGwei = BigInt(balanceGwei);
    const totalBalanceInWei = (totalBalanceInGwei * gWei) / tokenMultiplier;
    const totalBalanceInTokens = Number(formatEther(totalBalanceInWei));
    const totalBalanceUsd = totalBalanceInTokens * tokenPriceUsd;
    return {
      tokens: totalBalanceInTokens.toFixed(2),
      usd: totalBalanceUsd.toFixed(2),
      symbol: env.BLOCKCHAIN_TOKEN_SYMBOL,
    };
  };

  return {
    joining: {
      count: Number(data.joining),
      balance: convertBalance(data.joining_balance_gwei),
    },
    active: {
      count: Number(data.active),
      balance: convertBalance(data.active_balance_gwei),
    },
    leaving: {
      count: Number(data.leaving),
      balance: convertBalance(data.leaving_balance_gwei),
    },
    tokenPrice: {
      usd: tokenPriceUsd,
    },
    timestamp: new Date().toISOString(),
  };
}
