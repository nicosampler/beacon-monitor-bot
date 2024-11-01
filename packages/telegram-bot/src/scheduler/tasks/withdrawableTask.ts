/**
 * This module exports an AsyncTask instance that retrieves the withdrawable amount for each user and updates their stats.
 * @remarks
 * The `withdrawableTask` AsyncTask retrieves the withdrawable amount for each user.
 * The amounts are then aggregated by user and their stats are updated in the in-memory database.
 */

//import { multicallProvider } from "@/src/config/provider.js";
import { inMemoryUsers } from "@/src/utils/inMemoryDB.js";
import depositInstance from "@/src/utils/evm/deposit.js";
import { sleep } from "@/src/utils/misc.js";
import { getWithdrawalAddresses_db } from "@/src/prisma/withdrawalAddresses.js";
import { BigNumber, ethers } from "ethers";
import { formatEther } from "ethers/lib/utils.js";
import chunk from "lodash/chunk.js";
import { AsyncTask } from "toad-scheduler";

export const withdrawableTaskImp = async (userId?: number) => {
  try {
    const withdrawalAddresses = await getWithdrawalAddresses_db(userId);
    const withdrawalAddressesChunks = chunk(withdrawalAddresses, 15);

    const amounts: BigNumber[] = [];
    //multicallProvider.isMulticallEnabled = true;

    for (const chunk of withdrawalAddressesChunks) {
      const promises = chunk.map(({ address }) =>
        depositInstance.withdrawableAmount(address)
      );
      amounts.push(...(await Promise.all(promises)));
      await sleep(100);
    }

    //multicallProvider.isMulticallEnabled = false;

    const amountsInfo = amounts.map((amount, i) => ({
      withdrawalAddress: withdrawalAddresses[i].address,
      amount,
    }));

    const amountsByUser = amountsInfo.reduce(
      (acc, info) => {
        withdrawalAddresses
          .filter((wa) => wa.address === info.withdrawalAddress)
          .map((wa) => wa.users.map((u) => u.id))
          .forEach((userIds) => {
            userIds.forEach((_userId) => {
              const userId = Number(_userId);
              acc[userId] = acc[userId] || ethers.constants.Zero;
              acc[userId] = acc[userId].add(info.amount);
            });
          });

        return acc;
      },
      {} as Record<number, BigNumber>
    );

    Object.entries(amountsByUser).forEach(([_userId, amount]) => {
      const userId = +_userId;
      const user = inMemoryUsers[userId];
      if (!user) return;

      user.withdrawable = +formatEther(amount.toString());
    });
  } catch (error) {
    console.error("withdrawableTask", error);
  }
};

/**
 * AsyncTask instance that retrieves the withdrawable amount for each user and updates their stats.
 */
export const withdrawableTask = new AsyncTask("withdrawable", () =>
  withdrawableTaskImp().catch(console.error)
);
