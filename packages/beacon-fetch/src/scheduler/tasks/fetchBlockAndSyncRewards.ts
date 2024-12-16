import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";

import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import createLogger, { CustomLogger } from "@/src/lib/pino.js";
import { getOldestLookbackSlot } from "@/src/beacon/utils/misc.js";
import { env } from "@/src/env.js";
import { db_getLastSlotWithSyncRewards } from "@/src/feed/utils.js";
import { fetchBlockAndSyncRewards as _fetchBlockAndSyncRewards } from "@/src/feed/fetchBlockAndSyncRewards.js";
import { scheduler } from "@/src/lib/scheduler.js";

export const fetchBlockAndSyncRewardsTask = async (logger: CustomLogger) => {
  const now = new Date();
  const currentSlot = getSlotNumberFromTimestamp(now.getTime());
  const maxSlotToFetch = currentSlot - env.BEACON_DELAY_SLOTS_TO_HEAD;
  const oldestLookbackSlot = getOldestLookbackSlot();

  // Get the last processed slot
  const lastProcessedSlot = await db_getLastSlotWithSyncRewards();

  const slotToFetch = lastProcessedSlot
    ? lastProcessedSlot.slot + 1
    : oldestLookbackSlot;

  logger.addContext(`slot: ${slotToFetch}`);

  if (slotToFetch > maxSlotToFetch) {
    logger.info(`Skipping, greater than max slot to fetch ${maxSlotToFetch}`);
    return;
  }

  return _fetchBlockAndSyncRewards(slotToFetch, maxSlotToFetch, logger);
};

/* 
  This function get the sync committee and block rewards for a given slot.
  Data is saved to the HourlyValidatorStats table for the Date and Hour of the slot.
  It might collide with the existing data in the table as missedAttestations and attestations rewards are handled by other task ans saved to the same table.
  If a collision happens, existing data is kept and syncCommittee and blockReward are added to the existing data.
  
  It get's the last processed slot from the database and then fetches the rewards for the next slot. If the slot is greater than the max slot to fetch, it skips.
*/
export function scheduleFetchBlockAndSyncRewards({
  logsEnabled,
  interval,
  ID,
}: {
  logsEnabled: boolean;
  interval: number;
  ID: string;
}) {
  const logger = createLogger(ID, logsEnabled);

  const job = new SimpleIntervalJob(
    { milliseconds: interval, runImmediately: true },
    new AsyncTask(`${ID}_task`, () => {
      return fetchBlockAndSyncRewardsTask(logger).catch((e) =>
        logger.error("TASK-CATCH", e)
      );
    }),
    {
      id: ID,
      preventOverrun: true,
    }
  );

  scheduler.addSimpleIntervalJob(job);
}
