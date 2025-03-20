import { AsyncTask, SimpleIntervalJob } from 'toad-scheduler';

import { getOldestLookbackSlot } from '@/src/beacon/utils/misc.js';
import { getEpochNumberFromTimestamp } from '@/src/beacon/utils/time.js';
import { env } from '@/src/env.js';
import { fetchBeaconRewards } from '@/src/feed/fetchBeaconRewards.js'; // Assuming this function exists
import { db_getLastProcessedEpoch } from '@/src/feed/utils.js';
import createLogger from '@/src/lib/pino.js';
import { scheduler } from '@/src/lib/scheduler.js';

/* 
  This task fetches the beacon rewards 
  Rewards are distributed at the end of each epoch for all the validators.
  It fetches rewards for multiple epochs in parallel, but saves them sequentially.
  It skips fetching if the last slot with rewards is too far back in time.
  It also skips fetching if the last slot with rewards is from the current epoch.
 */
async function fetchBeaconRewardsTask(ID: string, logsEnabled: boolean) {
  const now = new Date();
  const currentEpoch = getEpochNumberFromTimestamp(now.getTime());
  const maxEpoch = currentEpoch - 2; // Give some buffer to avoid so many 404
  const oldestLookbackEpoch = Math.floor(getOldestLookbackSlot() / env.BEACON_SLOTS_PER_EPOCH);

  const lastProcessedEpoch = await db_getLastProcessedEpoch();

  if (lastProcessedEpoch?.epoch && lastProcessedEpoch.epoch + 1 > maxEpoch) {
    createLogger(ID).info(`No new epochs to fetch`);
    return;
  }

  const epochToFetch = lastProcessedEpoch
    ? Math.min(lastProcessedEpoch.epoch + 1, maxEpoch)
    : oldestLookbackEpoch;

  const logger = createLogger(`${ID} Epoch: ${epochToFetch}`, logsEnabled);
  logger.info(`Fetching. HeadEpoch: ${maxEpoch}.`);

  await fetchBeaconRewards(epochToFetch, logger);
}

export function scheduleFetchBeaconRewards({
  logsEnabled,
  interval,
  ID,
}: {
  logsEnabled: boolean;
  interval: number;
  ID: string;
}) {
  scheduler.addSimpleIntervalJob(
    new SimpleIntervalJob(
      { milliseconds: interval, runImmediately: true },
      new AsyncTask(`${ID}_task`, () => {
        const logger = createLogger(ID);
        return fetchBeaconRewardsTask(ID, logsEnabled).catch((e) => logger.error('TASK-CATCH', e));
      }),
      {
        id: ID,
        preventOverrun: true,
      },
    ),
  );
}
