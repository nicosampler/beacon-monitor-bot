import { AsyncTask, SimpleIntervalJob } from 'toad-scheduler';

import { getEpochFromSlot, getOldestLookbackSlot } from '@/src/beacon/utils/misc.js';
import { getSlotNumberFromTimestamp } from '@/src/beacon/utils/time.js';
import { env } from '@/src/env.js';
import { fetchCommittee } from '@/src/feed/fetchCommittee.js';
import { db_getLastSlotInCommittee, db_getLastSlotWithAttestations } from '@/src/feed/utils.js';
import createLogger, { CustomLogger } from '@/src/lib/pino.js';
import { scheduler } from '@/src/lib/scheduler.js';
import { TaskOptions } from '@/src/scheduler/tasks/types.js';

// Add new function to calculate next slots to fetch
async function fetchNewCommittees(logger: CustomLogger): Promise<void> {
  const now = new Date();
  const headSlot = getSlotNumberFromTimestamp(now.getTime());
  const headEpoch = getEpochFromSlot(headSlot);

  const lastSlotInCommittee = await db_getLastSlotInCommittee();

  const slotToFetch = lastSlotInCommittee ? lastSlotInCommittee.slot + 1 : getOldestLookbackSlot();
  const epochToFetch = getEpochFromSlot(slotToFetch);

  logger.addContext(`Slot: ${slotToFetch}/${headSlot} - Epoch: ${epochToFetch}/${headEpoch}`);
  logger.info('');

  // Skip if the committee does not exist yet
  if (slotToFetch > headSlot + env.BEACON_SLOTS_PER_EPOCH) {
    logger.info(`Skipping, epoch ${epochToFetch} is too far in the future`);
    return;
  }

  // skip if fetch attestations is delayed
  const lastSlotWithAttestations = await db_getLastSlotWithAttestations();
  if (
    (lastSlotInCommittee?.slot ?? 0) - (lastSlotWithAttestations?.slot ?? 0) >=
    env.BEACON_SLOTS_PER_EPOCH * 25
  ) {
    logger.info(`Skipping, last slot with attestations is too back in time`);
    return;
  }

  // Logging the context
  logger.info('');

  await fetchCommittee(logger, epochToFetch, lastSlotInCommittee?.slot || -1);

  logger.info(`Done!`);
}

export function scheduleFetchCommittee({
  id,
  logsEnabled,
  intervalMs,
  runImmediately,
  preventOverrun,
}: TaskOptions) {
  const logger = createLogger(id, logsEnabled);

  const task = new AsyncTask(`${id}_task`, () =>
    fetchNewCommittees(logger).catch((e) => {
      logger.error('TASK-CATCH', e);
    }),
  );

  const job = new SimpleIntervalJob(
    { milliseconds: intervalMs, runImmediately: runImmediately },
    task,
    {
      id: id,
      preventOverrun: preventOverrun,
    },
  );

  scheduler.addSimpleIntervalJob(job);
}
