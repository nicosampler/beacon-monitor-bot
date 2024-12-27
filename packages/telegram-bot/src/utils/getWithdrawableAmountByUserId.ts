/**
 * This module exports a memoized function that retrieves the withdrawable amount for a specific user.
 * @remarks
 * The function is memoized with a 5-minute cache duration to prevent excessive blockchain calls.
 */

import { multicallProvider } from "@/src/config/provider.js";
import depositInstance from "@/src/utils/evm/deposit.js";
import { sleep } from "@/src/utils/misc.js";
import { getWithdrawalAddresses_db } from "@/src/prisma/withdrawalAddresses.js";
import { BigNumber, ethers } from "ethers";
import { formatEther } from "ethers/lib/utils.js";
import chunk from "lodash/chunk.js";
import memoizee from "memoizee";
import ms from "ms";
import { ZERO_BN } from "@/src/constants/index.js";

const fetchWithdrawableAmount = async (userId: number) => {
  try {
    const withdrawalAddresses = await getWithdrawalAddresses_db(userId);
    const withdrawalAddressesChunks = chunk(withdrawalAddresses, 15);

    const amounts: BigNumber[] = [];

    multicallProvider.isMulticallEnabled = true;
    for (const chunk of withdrawalAddressesChunks) {
      const promises = chunk.map(({ address }) =>
        depositInstance.withdrawableAmount(address)
      );
      amounts.push(...(await Promise.all(promises)));
      await sleep(100);
    }
    multicallProvider.isMulticallEnabled = false;

    return amounts.reduce(
      (acc, amount) => acc.add(amount),
      ethers.constants.Zero
    );
  } catch (error) {
    console.error("getWithdrawableAmount", error);
    return ZERO_BN;
  }
};

export const getWithdrawableAmountByUserId: (
  userId: number
) => Promise<BigNumber> = memoizee(fetchWithdrawableAmount, {
  promise: true,
  maxAge: ms("5m"),
  primitive: true,
});
