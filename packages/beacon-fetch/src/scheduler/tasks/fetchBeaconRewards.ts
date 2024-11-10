import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import createLogger from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";
import {
  getEpochNumberFromTimestamp,
  getTimestampFromSlotNumber,
} from "@/src/beacon/utils/time.js";
import { getOldestLookbackSlot } from "@/src/beacon/utils/misc.js";
import { env } from "@/src/env.js";
import { fetchBeaconRewards } from "@/src/feed/fetchBeaconRewards.js"; // Assuming this function exists

const prisma = getPrisma();
const ID = "fetchBeaconRewards";
const logger = createLogger(ID, false);

const SLOTS_PER_EPOCH = env.BEACON_SLOTS_PER_EPOCH;

async function fetchBeaconRewardsTask() {
  const now = new Date();
  const currentEpoch = getEpochNumberFromTimestamp(now.getTime());
  const headEpoch = currentEpoch - 2; // Give some buffer to avoid so many 404
  const oldestLookbackEpoch = Math.floor(
    getOldestLookbackSlot() / SLOTS_PER_EPOCH
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

    const lastSlotWithRewards = await prisma.slot.findFirst({
      where: { attestationsFetched: true },
      orderBy: { slot: "desc" },
    });

    const epochOfLastSlotWithRewards = getEpochNumberFromTimestamp(
      getTimestampFromSlotNumber(lastSlotWithRewards?.slot)
    );

    if (epochToFetch - epochOfLastSlotWithRewards > 2) {
      logger.info(`Skipping, last slot with rewards is too back in time.`);
      return;
    }

    // Calculate how many epochs we can process based on distance to head
    const epochDistance = headEpoch - epochToFetch;
    const epochsToProcess: number[] = [];
    let currentEpochToAdd = epochToFetch;

    if (epochDistance > 0) {
      // Process up to 5 epochs, or the actual distance if it's smaller
      const numberOfEpochsToProcess = Math.min(epochDistance, 5);

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
  { seconds: 160, runImmediately: true },
  new AsyncTask(`${ID}_task`, fetchBeaconRewardsTask),
  {
    id: ID,
    preventOverrun: true,
  }
);
