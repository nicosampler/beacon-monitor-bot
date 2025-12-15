import { AsyncTask, SimpleIntervalJob } from 'toad-scheduler';

import { getEpochFromSlot, getOldestLookbackSlot } from '@/src/beacon/utils/misc.js';
import { getSlotNumberFromTimestamp } from '@/src/beacon/utils/time.js';
import { env } from '@/src/env.js';
import { fetchAttestation as _fetchAttestations } from '@/src/feed/fetchAttestations.js';
import { db_getLastSlotWithAttestations, db_hasEpochCommittees } from '@/src/feed/utils.js';
import createLogger, { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';
import { scheduler } from '@/src/lib/scheduler.js';
import { TaskOptions } from '@/src/scheduler/tasks/types.js';

const prisma = getPrisma();

export const fetchAttestations = async (logger: CustomLogger) => {
  const now = new Date();
  const currentSlot = getSlotNumberFromTimestamp(now.getTime());
  const maxSlotToFetch = currentSlot - env.BEACON_DELAY_SLOTS_TO_HEAD;
  const oldestLookbackSlot = getOldestLookbackSlot();

  try {
    // Get the last slot for which we have attestations
    const lastProcessedSlot = await db_getLastSlotWithAttestations();
    const slotToFetch = lastProcessedSlot ? lastProcessedSlot.slot + 1 : oldestLookbackSlot;
    const epochToFetch = getEpochFromSlot(slotToFetch);

    logger.addContext(`attestation: ${slotToFetch}`);

    // Skip if the slot to fetch is greater than the max slot to fetch
    if (slotToFetch > maxSlotToFetch) {
      logger.info(
        `Skipping, slot to fetch ${slotToFetch} is greater than max slot to fetch ${maxSlotToFetch}`,
      );
      return;
    }

    // Skip if the committees for the slot have not been fetched
    const hasEpochCommittees = await db_hasEpochCommittees(epochToFetch);
    if (!hasEpochCommittees) {
      logger.info(`Skipping, committees for epoch ${epochToFetch} not fetched.`);
      return;
    }

    // TODO: move to another task (?)
    // We delete attestations that came "on-time" to reduce the amount of data in the database.
    // Attestations for slot n can come one up to one epoch later.
    // It's quite important to not delete data that could be re-inserted later.
    const cleanupIntervalSlots = env.BEACON_SLOTS_PER_EPOCH * 3;
    if (slotToFetch % cleanupIntervalSlots === 0) {
      await prisma.committee.deleteMany({
        where: {
          slot: {
            lt: slotToFetch - cleanupIntervalSlots, // some buffer just in case
          },
          attestationDelay: {
            lte: env.BEACON_MAX_ATTESTATION_DELAY,
          },
        },
      });
    }

    return _fetchAttestations(slotToFetch, logger);
  } catch (error) {
    logger.error('Error fetching attestations:', error);
  }
};

export function scheduleFetchAttestations({
  id,
  logsEnabled,
  intervalMs,
  runImmediately,
  preventOverrun,
}: TaskOptions) {
  const logger = createLogger(id, logsEnabled);

  const task = new AsyncTask(`${id}_task`, () => {
    return fetchAttestations(logger).catch((e) => logger.error('TASK-CATCH', e));
  });

  scheduler.addSimpleIntervalJob(
    new SimpleIntervalJob({ milliseconds: intervalMs, runImmediately }, task, {
      id,
      preventOverrun,
    }),
  );
}
