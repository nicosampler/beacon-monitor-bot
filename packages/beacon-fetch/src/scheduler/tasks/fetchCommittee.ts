import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import createLogger from "@/src/lib/pino.js";
import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import {
  db_getLastSlotInCommittee,
  db_getLastSlotWithAttestations,
} from "@/src/feed/utils.js";
import {
  getEpochFromSlot,
  getOldestLookbackSlot,
} from "@/src/beacon/utils/misc.js";
import { env } from "@/src/env.js";
import { fetchCommittee } from "@/src/feed/fetchCommittee.js";

const ID = "FetchCommittee";

// Add new function to calculate next slots to fetch
async function fetchNewCommittees() {
  const now = new Date();
  const headSlot = getSlotNumberFromTimestamp(now.getTime());
  const headEpoch = getEpochFromSlot(headSlot);

  const oldestLookbackSlot = getOldestLookbackSlot();
  const lastSlotInCommittee = await db_getLastSlotInCommittee();
  const slotToFetch = lastSlotInCommittee
    ? lastSlotInCommittee.slot + 1
    : oldestLookbackSlot;
  const slotToFetchEpoch = getEpochFromSlot(slotToFetch);

  const logger = createLogger(
    `${ID} epoch ${slotToFetchEpoch} - HeadEpoch:${headEpoch} HeadSlot:${headSlot}`
  );

  // Skip if the committee does not exist yet
  if (slotToFetchEpoch > headEpoch + 2) {
    logger.info(`Skipping, epoch ${slotToFetchEpoch} is too far in the future`);
    return null;
  }

  // skip if fetch attestations is delayed
  const lastSlotWithAttestations = await db_getLastSlotWithAttestations();
  if (
    lastSlotInCommittee?.slot - lastSlotWithAttestations?.slot >=
    env.BEACON_SLOTS_PER_EPOCH * 25
  ) {
    logger.info(`Skipping, last slot with attestations is too back in time`);
    return null;
  }

  await fetchCommittee(
    logger,
    slotToFetchEpoch,
    lastSlotInCommittee?.slot || -1
  );

  logger.info(`Done!`);
}

export const job = new SimpleIntervalJob(
  { seconds: 10, runImmediately: true },
  new AsyncTask(`${ID}_task`, () => {
    return fetchNewCommittees().catch((e) => {
      const logger = createLogger(ID);
      logger.error("TASK-CATCH", e);
    });
  }),
  {
    id: ID,
    preventOverrun: true,
  }
);
