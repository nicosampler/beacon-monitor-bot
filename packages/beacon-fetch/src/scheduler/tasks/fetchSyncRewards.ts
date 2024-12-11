import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";

import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import createLogger from "@/src/lib/pino.js";
import { getOldestLookbackSlot } from "@/src/beacon/utils/misc.js";
import { env } from "@/src/env.js";
import { db_getLastSlotWithSyncRewards } from "@/src/feed/utils.js";
import { fetchSyncRewards as _fetchSyncRewards } from "@/src/feed/fetchSyncRewards.js";

const ID = "FetchSyncRewards";

export const fetchBlockAndSyncRewards = async () => {
  const now = new Date();
  const currentSlot = getSlotNumberFromTimestamp(now.getTime());
  const maxSlotToFetch = currentSlot - env.BEACON_DELAY_SLOTS_TO_HEAD;
  const oldestLookbackSlot = getOldestLookbackSlot();

  try {
    // Get the last processed slot
    const lastProcessedSlot = await db_getLastSlotWithSyncRewards();

    const slotToFetch = lastProcessedSlot
      ? lastProcessedSlot.slot + 1
      : oldestLookbackSlot;

    const logger = createLogger(`${ID} for slot ${slotToFetch}`, false);

    if (slotToFetch > maxSlotToFetch) {
      logger.info(`Skipping, greater than max slot to fetch ${maxSlotToFetch}`);
      return;
    }

    return _fetchSyncRewards(slotToFetch, logger);
  } catch (error) {}
};

export const job = new SimpleIntervalJob(
  { seconds: 1, runImmediately: true },
  new AsyncTask(`${ID}_task`, () => {
    const logger = createLogger(ID);
    return fetchBlockAndSyncRewards().catch((e) =>
      logger.error("TASK-CATCH", e)
    );
  }),
  {
    id: ID,
    preventOverrun: true,
  }
);
