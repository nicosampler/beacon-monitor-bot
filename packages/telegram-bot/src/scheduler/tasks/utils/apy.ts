import { DAYS_IN_YEAR } from "@/src/constants/index.js";

export function calculateAPY_daily(
  totalBalance: number,
  dailyRewards: number
): number {
  if (!totalBalance || !dailyRewards) return 0;
  return ((1 + dailyRewards / totalBalance) ** DAYS_IN_YEAR - 1) * 100;
}

export function calculateAPY_weekly(
  totalBalance: number,
  weeklyRewards: number
): number {
  if (!totalBalance || !weeklyRewards) return 0;
  return ((1 + weeklyRewards / totalBalance) ** (DAYS_IN_YEAR / 7) - 1) * 100;
}
