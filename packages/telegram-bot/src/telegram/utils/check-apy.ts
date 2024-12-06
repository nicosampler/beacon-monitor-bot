import { formatEther } from "ethers/lib/utils.js";

const _dailyRewards =
  (BigInt(1622171 + 3237248 + 1761273) * BigInt(10 ** 18)) /
  BigInt(32000000000);
const dailyRewards = Number(formatEther(_dailyRewards));
const totalBalance = 1.00036;
const APY = (dailyRewards / totalBalance) * 365 * 100;

console.log({
  _dailyRewards,
  dailyRewards,
  totalBalance,
  APY,
});
