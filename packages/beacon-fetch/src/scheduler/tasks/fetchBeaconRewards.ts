import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import createLogger from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { getEpochNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { getOldestLookbackSlot } from "@/src/beacon/utils/misc.js";
import { env } from "@/src/env.js";
import { fetchBeaconRewards } from "@/src/feed/fetchBeaconRewards.js"; // Assuming this function exists

const prisma = getPrisma();
const ID = "fetchBeaconRewards";
const logger = createLogger(ID, false);

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

  try {
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

    // Calculate how many epochs we can process based on distance to head
    const epochDistance = headEpoch - epochToFetch;
    const epochsToProcess: number[] = [];
    let currentEpochToAdd = epochToFetch;

    if (epochDistance > 0) {
      // Process up to N epochs, or the actual distance if it's smaller
      const numberOfEpochsToProcess = Math.min(epochDistance, 3);

      for (
        let i = 0;
        i < numberOfEpochsToProcess && currentEpochToAdd <= headEpoch;
        i++
      ) {
        epochsToProcess.push(currentEpochToAdd);
        currentEpochToAdd++;
      }
    } else {
      epochsToProcess.push(epochToFetch);
    }

    logger.info(
      `Fetching beacon rewards for epochs ${epochsToProcess.join(", ")}. HeadEpoch: ${headEpoch}.`
    );

    await fetchBeaconRewards(epochsToProcess, logger);
  } catch (error) {
    logger.error(`Error fetching beacon rewards: ${error}`, error);
  }
}

export const job = new SimpleIntervalJob(
  { seconds: 20, runImmediately: true },
  new AsyncTask(`${ID}_task`, () =>
    fetchBeaconRewardsTask().catch((e) => logger.error("TASK-CATCH", e))
  ),
  {
    id: ID,
    preventOverrun: true,
  }
);
