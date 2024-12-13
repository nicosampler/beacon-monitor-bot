import { formatEther } from "ethers/lib/utils.js";
				
const _dailyRewards =
  (BigInt(1580042 + 3215023 + 1763526 + 19075054) * BigInt(10 ** 18)) /
  BigInt(32000000000);

 const dailyRewards = Number(formatEther(_dailyRewards));

 console.log(dailyRewards);


  //(BigInt(52299844) * BigInt(10 ** 18)) / BigInt(32000000000);
// const dailyRewards = Number(formatEther(_dailyRewards));
// const totalBalance = 1.00036;
// const APY = (dailyRewards / totalBalance) * 365 * 100;

// console.log({
//   _dailyRewards,
//   dailyRewards,
//   totalBalance,
//   APY,
// });
