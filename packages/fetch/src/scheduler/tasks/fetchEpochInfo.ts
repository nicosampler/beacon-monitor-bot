import { AsyncTask, SimpleIntervalJob } from 'toad-scheduler';

import { fetchBeaconRewards } from '@/src/beacon/feed/fetchBeaconRewards.js'; // Assuming this function exists
import { fetchValidators } from '@/src/beacon/feed/fetchValidators.js';
import { getEpochSlots, getOldestLookbackSlot } from '@/src/beacon/utils/misc.js';
import {
  getEpochNumberFromTimestamp,
  getSlotNumberFromTimestamp,
} from '@/src/beacon/utils/time.js';
import { env } from '@/src/env.js';
import createLogger, { CustomLogger } from '@/src/lib/pino.js';
import { scheduler } from '@/src/lib/scheduler.js';
import { TaskOptions } from '@/src/scheduler/tasks/types.js';
import {
  db_getEpochByNumber,
  db_getLastProcessedEpoch,
  db_getValidatorIdsForFetching,
} from '@/src/utils/db.js';

/* 
  This function fetches Epoch information.
  Purpose:
  * Get validators info, validators effective balances, and beacon rewards for the epoch. (to calculate missed rewards)
  * TODO: move all the fetchers related to epoch to this function
*/
async function fetchEpochInfoTask(logger: CustomLogger) {
  const currentEpoch = getEpochNumberFromTimestamp(new Date().getTime());
  const currentSlot = getSlotNumberFromTimestamp(new Date().getTime());

  // get the last processed epoch with:
  // validatorsInfoFetched: true
  // validatorsBalancesFetched: true
  // rewardsFetched: true
  const lastProcessedEpoch = await db_getLastProcessedEpoch();
  const oldestLookbackEpoch = Math.floor(getOldestLookbackSlot() / env.BEACON_SLOTS_PER_EPOCH);
  const epochToFetch = lastProcessedEpoch ? lastProcessedEpoch.epoch + 1 : oldestLookbackEpoch;
  const { endSlot } = getEpochSlots(epochToFetch);

  logger.addContext(`epoch: ${epochToFetch}`);

  // We need to wait for the current epoch to finish
  if (epochToFetch >= currentEpoch) {
    logger.info(`To soon to fetch`);
    return;
  }

  // give 3 slots of the current epoch before fetching the epoch we need to fetch
  if (currentSlot < endSlot + 3) {
    logger.info(`To soon to fetch`);
    return;
  }

  const dbEpoch = await db_getEpochByNumber(epochToFetch);
  if (!dbEpoch) {
    logger.info(`Epoch ${epochToFetch} not found in the database`);
    return;
  }

  logger.info(`Starting to process`);

  // Get all validator IDs needed for both functions in a single query (optimization)
  const needsValidatorsFetch = !dbEpoch.validatorsInfoFetched;
  const needsBalancesFetch = !dbEpoch.validatorsBalancesFetched;

  let finalValidatorIds: number[] | undefined;
  //let activeValidatorIds: number[] | undefined;
  let maxValidatorId: number | undefined;
  if (needsValidatorsFetch || needsBalancesFetch) {
    logger.info(`Getting validator data for fetching.`);
    const validatorData = await db_getValidatorIdsForFetching();
    finalValidatorIds = validatorData.finalValidatorIds; // Already fetched in db_getValidatorIdsForFetching
    //activeValidatorIds = validatorData.activeValidatorIds;
    maxValidatorId = validatorData.maxValidatorId;
  }

  const promises: Promise<void>[] = [];
  if (needsValidatorsFetch && finalValidatorIds && maxValidatorId) {
    promises.push(fetchValidators(logger, epochToFetch, 'head', finalValidatorIds, maxValidatorId));
  }
  // if (needsBalancesFetch && activeValidatorIds) {
  //   promises.push(fetchValidatorsBalances(logger, epochToFetch, startSlot, activeValidatorIds));
  // }
  if (promises.length > 0) {
    await Promise.all(promises);
  }

  // Get beacon rewards for the current epoch
  if (!dbEpoch.rewardsFetched) {
    await fetchBeaconRewards(logger, epochToFetch);
  }
}

export function scheduleFetchEpochInfo({
  id,
  logsEnabled,
  intervalMs,
  runImmediately,
  preventOverrun,
}: TaskOptions) {
  const logger = createLogger(id, logsEnabled);
  const task = new AsyncTask(`${id}_task`, () => {
    return fetchEpochInfoTask(logger).catch((e) => logger.error('TASK-CATCH', e));
  });
  scheduler.addSimpleIntervalJob(
    new SimpleIntervalJob({ milliseconds: intervalMs, runImmediately }, task, {
      id,
      preventOverrun,
    }),
  );
}
