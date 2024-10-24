import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import createLogger from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { getEpochNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { getOldestLookbackSlot } from "@/src/beacon/utils/misc.js";
import { env } from "@/src/env.js";
import { fetchBeaconRewards } from "@/src/feed/fetchBeaconRewards.js"; // Assuming this function exists

const prisma = getPrisma();
const logger = createLogger("Fetch BeaconRewards");

const SLOTS_PER_EPOCH = env.BEACON_SLOTS_PER_EPOCH;
const ID = "fetchBeaconRewards";

async function fetchBeaconRewardsTask() {
  const now = new Date();
  const currentEpoch = getEpochNumberFromTimestamp(now.getTime());
  const headEpoch = currentEpoch - 1; // We fetch the previous epoch
  const oldestLookbackEpoch = Math.floor(
    getOldestLookbackSlot() / SLOTS_PER_EPOCH
  );

  const lastProcessedEpoch = await prisma.epoch.findFirst({
    where: {
      rewardsFetched: true,
    },
    orderBy: { epoch: "desc" },
    select: { epoch: true },
  });

  const epochToFetch = lastProcessedEpoch
    ? Math.min(lastProcessedEpoch.epoch + 1, headEpoch)
    : oldestLookbackEpoch;

  if (epochToFetch > headEpoch) {
    logger.info(`No new epochs to fetch`);
    return;
  }

  logger.info(
    `Fetching beacon rewards for epoch ${epochToFetch}. HeadEpoch: ${headEpoch}.`
  );

  await fetchBeaconRewards(epochToFetch, logger);
}

export const job = new SimpleIntervalJob(
  { seconds: 8, runImmediately: true },
  new AsyncTask(`${ID}_task`, fetchBeaconRewardsTask),
  {
    id: ID,
    preventOverrun: true,
  }
);
