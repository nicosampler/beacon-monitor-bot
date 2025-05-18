import { AsyncTask, SimpleIntervalJob } from 'toad-scheduler';

import { getOldestLookbackSlot } from '@/src/beacon/utils/misc.js';
import { getSlotNumberFromTimestamp } from '@/src/beacon/utils/time.js';
import { env } from '@/src/env.js';
import { fetchBlockAndSyncRewards as _fetchBlockAndSyncRewards } from '@/src/feed/fetchBlockAndSyncRewards.js';
import { db_getLastSlotWithSyncRewards, db_getSlotByNumber } from '@/src/feed/utils.js';
import createLogger, { CustomLogger } from '@/src/lib/pino.js';
import { scheduler } from '@/src/lib/scheduler.js';
import { TaskOptions } from '@/src/scheduler/tasks/types.js';

export const fetchBlockAndSyncRewardsTask = async (logger: CustomLogger) => {
  const now = new Date();
  const currentSlot = getSlotNumberFromTimestamp(now.getTime());
  const maxSlotToFetch = currentSlot - env.BEACON_DELAY_SLOTS_TO_HEAD;

  // Get slot to fetch
  const oldestLookbackSlot = getOldestLookbackSlot();
  const lastProcessedSlot = await db_getLastSlotWithSyncRewards();
  const slotToFetch = lastProcessedSlot ? lastProcessedSlot.slot + 1 : oldestLookbackSlot;

  logger.addContext(`slot: ${slotToFetch}`);

  if (slotToFetch > maxSlotToFetch) {
    logger.info(`Skipping, greater than max slot to fetch ${maxSlotToFetch}`);
    return;
  }

  const slot = await db_getSlotByNumber(slotToFetch);
  if (!slot) {
    logger.info(`Skipping, slot ${slotToFetch} not found in the database`);
    return;
  }

  return _fetchBlockAndSyncRewards(slotToFetch, maxSlotToFetch, logger);
};

/* 
  This function get the sync committee and block rewards for a given slot.
  Data is saved to the HourlyBlockAndSyncRewards table for the Date and Hour of the slot.
  It might collide with the existing data in the table as missedAttestations and attestations rewards are handled by other task ans saved to the same table.
  If a collision happens, existing data is kept and syncCommittee and blockReward are added to the existing data.
  
  It get's the last processed slot from the database and then fetches the rewards for the next slot. If the slot is greater than the max slot to fetch, it skips.
*/
export function scheduleFetchBlockAndSyncRewards({
  id,
  logsEnabled,
  intervalMs,
  runImmediately,
  preventOverrun,
}: TaskOptions) {
  const logger = createLogger(id, logsEnabled);
  const task = new AsyncTask(`${id}_task`, () => {
    return fetchBlockAndSyncRewardsTask(logger).catch((e) => logger.error('TASK-CATCH', e));
  });
  scheduler.addSimpleIntervalJob(
    new SimpleIntervalJob({ milliseconds: intervalMs, runImmediately }, task, {
      id,
      preventOverrun,
    }),
  );
}
