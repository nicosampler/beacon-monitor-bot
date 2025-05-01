import { DAYS_IN_YEAR } from '@/src/constants/index.js';

/**
 * Calculates the Annual Percentage Yield (APY) based on daily rewards
 * @param totalBalance - The total balance of the validator
 * @param dailyRewards - The daily rewards earned
 * @returns The calculated APY as a percentage
 */
export function calculateAPY_daily(totalBalance: number, dailyRewards: number): number {
  if (!totalBalance || !dailyRewards) return 0;
  return ((1 + dailyRewards / totalBalance) ** DAYS_IN_YEAR - 1) * 100;
}

/**
 * Calculates the Annual Percentage Yield (APY) based on weekly rewards
 * @param totalBalance - The total balance of the validator
 * @param weeklyRewards - The weekly rewards earned
 * @returns The calculated APY as a percentage
 */
export function calculateAPY_weekly(totalBalance: number, weeklyRewards: number): number {
  if (!totalBalance || !weeklyRewards) return 0;
  return ((1 + weeklyRewards / totalBalance) ** (DAYS_IN_YEAR / 7) - 1) * 100;
}

/**
 * Calculates the Annual Percentage Yield (APY) based on monthly rewards
 * @param totalBalance - The total balance of the validator
 * @param monthlyRewards - The monthly rewards earned
 * @returns The calculated APY as a percentage
 */
export function calculateMonthlyAPY(totalBalance: number, monthlyRewards: number): number {
  if (!totalBalance || !monthlyRewards) return 0;
  return ((1 + monthlyRewards / totalBalance) ** (DAYS_IN_YEAR / 30) - 1) * 100;
}
