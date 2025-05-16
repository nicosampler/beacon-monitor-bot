import { AsyncTask, SimpleIntervalJob } from 'toad-scheduler';

import { getEpochFromSlot, getOldestLookbackSlot } from '@/src/beacon/utils/misc.js';
import { getSlotNumberFromTimestamp } from '@/src/beacon/utils/time.js';
import { fetchCommittee } from '@/src/feed/fetchCommittee.js';
import {
  db_createEpoch,
  db_getLastEpochWithCommittees,
  db_getLastSlotWithAttestations,
} from '@/src/feed/utils.js';
import createLogger, { CustomLogger } from '@/src/lib/pino.js';
import { scheduler } from '@/src/lib/scheduler.js';
import { TaskOptions } from '@/src/scheduler/tasks/types.js';

// Add new function to calculate next slots to fetch`
async function fetchNewCommittees(logger: CustomLogger): Promise<void> {
  const oldestLookbackSlot = getOldestLookbackSlot();
  const oldestLookbackEpoch = getEpochFromSlot(oldestLookbackSlot);

  const now = new Date();
  const headSlot = getSlotNumberFromTimestamp(now.getTime());
  const headEpoch = getEpochFromSlot(headSlot);

  // get the next epoch to fetch
  const lastEpochWithCommittees = await db_getLastEpochWithCommittees();
  const epochToFetch = lastEpochWithCommittees
    ? lastEpochWithCommittees.epoch + 1
    : oldestLookbackEpoch;
  logger.addContext(`Epoch: ${epochToFetch}`);

  // Skip if the committee data for the epoch is not yet available
  if (epochToFetch > headEpoch + 1) {
    logger.info(`Skipping, epoch ${epochToFetch} is too far in the future`);
    return;
  }

  // skip if the fetch attestations process is delayed to avoid making Committee table too big
  const lastSlotWithAttestations = await db_getLastSlotWithAttestations();
  const lastEpochWithAttestations = await getEpochFromSlot(
    lastSlotWithAttestations?.slot || oldestLookbackSlot,
  );
  if (epochToFetch - lastEpochWithAttestations > 25) {
    logger.info(`Skipping, attestations process is too delayed.`);
    return;
  }

  // create epoch
  await db_createEpoch(epochToFetch);

  // fetch committee for the epoch
  logger.info(`FetchCommittee: Distance to head: ${headEpoch - epochToFetch} epochs`);
  await fetchCommittee(logger, epochToFetch);

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
