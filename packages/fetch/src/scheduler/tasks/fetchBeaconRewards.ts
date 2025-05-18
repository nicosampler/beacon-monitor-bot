import { AsyncTask, SimpleIntervalJob } from 'toad-scheduler';

import { getOldestLookbackSlot } from '@/src/beacon/utils/misc.js';
import { getEpochNumberFromTimestamp } from '@/src/beacon/utils/time.js';
import { env } from '@/src/env.js';
import { fetchBeaconRewards } from '@/src/feed/fetchBeaconRewards.js'; // Assuming this function exists
import { db_getEpochByNumber, db_getLastProcessedEpoch } from '@/src/feed/utils.js';
import createLogger, { CustomLogger } from '@/src/lib/pino.js';
import { scheduler } from '@/src/lib/scheduler.js';
import { TaskOptions } from '@/src/scheduler/tasks/types.js';

/* 
  This task fetches the beacon rewards 
  Rewards are distributed at the end of each epoch for all the validators.
  It fetches rewards for multiple epochs in parallel, but saves them sequentially.
  It skips fetching if the last slot with rewards is too far back in time.
  It also skips fetching if the last slot with rewards is from the current epoch.
 */
async function fetchBeaconRewardsTask(logger: CustomLogger) {
  const currentEpoch = getEpochNumberFromTimestamp(new Date().getTime());
  const maxEpoch = currentEpoch - 2; // Give some buffer to avoid so many 404

  const oldestLookbackEpoch = Math.floor(getOldestLookbackSlot() / env.BEACON_SLOTS_PER_EPOCH);
  const lastProcessedEpoch = await db_getLastProcessedEpoch();
  const epochToFetch = lastProcessedEpoch ? lastProcessedEpoch.epoch + 1 : oldestLookbackEpoch;
  logger.addContext(`FetchBeaconRewards for epoch: ${epochToFetch}`);

  if (epochToFetch > maxEpoch) {
    logger.info(`No new epochs to fetch`);
    return;
  }

  const dbEpoch = await db_getEpochByNumber(epochToFetch);
  if (!dbEpoch) {
    logger.info(`Epoch ${epochToFetch} not found in the database`);
    return;
  }

  logger.info(`Fetching. HeadEpoch: ${maxEpoch}.`);

  await fetchBeaconRewards(epochToFetch, logger);
}

export function scheduleFetchBeaconRewards({
  id,
  logsEnabled,
  intervalMs,
  runImmediately,
  preventOverrun,
}: TaskOptions) {
  const logger = createLogger(id, logsEnabled);
  const task = new AsyncTask(`${id}_task`, () => {
    return fetchBeaconRewardsTask(logger).catch((e) => logger.error('TASK-CATCH', e));
  });
  scheduler.addSimpleIntervalJob(
    new SimpleIntervalJob({ milliseconds: intervalMs, runImmediately }, task, {
      id,
      preventOverrun,
    }),
  );
}
