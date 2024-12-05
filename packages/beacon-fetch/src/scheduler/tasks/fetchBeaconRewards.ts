import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import createLogger from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { getEpochNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { getOldestLookbackSlot } from "@/src/beacon/utils/misc.js";
import { env } from "@/src/env.js";
import { fetchBeaconRewards } from "@/src/feed/fetchBeaconRewards.js"; // Assuming this function exists

const prisma = getPrisma();
const ID = "fetchBeaconRewards";

/* 
  This task fetches the beacon rewards 
  Rewards are distributed at the end of each epoch for all the validators.
  It fetches rewards for multiple epochs in parallel, but saves them sequentially.
  It skips fetching if the last slot with rewards is too far back in time.
  It also skips fetching if the last slot with rewards is from the current epoch.
 */
async function fetchBeaconRewardsTask() {
  const now = new Date();
  const currentEpoch = getEpochNumberFromTimestamp(now.getTime());
  const headEpoch = currentEpoch - 2; // Give some buffer to avoid so many 404
  const oldestLookbackEpoch = Math.floor(
    getOldestLookbackSlot() / env.BEACON_SLOTS_PER_EPOCH
  );

  const lastProcessedEpoch = await prisma.epoch.findFirst({
    where: {
      rewardsFetched: true,
    },
    orderBy: { epoch: "desc" },
    select: { epoch: true },
  });

  if (lastProcessedEpoch?.epoch + 1 > headEpoch) {
    createLogger(ID).info(`No new epochs to fetch`);
    return;
  }

  const epochToFetch = lastProcessedEpoch
    ? Math.min(lastProcessedEpoch.epoch + 1, headEpoch)
    : oldestLookbackEpoch;

  const logger = createLogger(`${ID} Epoch: ${epochToFetch}`);
  logger.info(`Fetching. HeadEpoch: ${headEpoch}.`);

  await fetchBeaconRewards(epochToFetch, logger);

  logger.info(`Done`);
}

export const job = new SimpleIntervalJob(
  { seconds: 5, runImmediately: true },
  new AsyncTask(`${ID}_task`, () => {
    const logger = createLogger(ID);
    return fetchBeaconRewardsTask().catch((e) => logger.error("TASK-CATCH", e));
  }),
  {
    id: ID,
    preventOverrun: true,
  }
);
