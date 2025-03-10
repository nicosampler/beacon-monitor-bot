import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";

import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { fetchAttestation as _fetchAttestations } from "@/src/feed/fetchAttestations.js";
import createLogger, { CustomLogger } from "@/src/lib/pino.js";
import { getOldestLookbackSlot } from "@/src/beacon/utils/misc.js";
import { env } from "@/src/env.js";
import {
  db_existCommitteeForSlot,
  db_getLastSlotWithAttestations,
} from "@/src/feed/utils.js";
import { scheduler } from "@/src/lib/scheduler.js";
import { TaskOptions } from "@/src/scheduler/tasks/types.js";

export const fetchAttestations = async (logger: CustomLogger) => {
  const now = new Date();
  const currentSlot = getSlotNumberFromTimestamp(now.getTime());
  const maxSlotToFetch = currentSlot - env.BEACON_DELAY_SLOTS_TO_HEAD;
  const oldestLookbackSlot = getOldestLookbackSlot();

  try {
    // Get the last processed slot
    const lastProcessedSlot = await db_getLastSlotWithAttestations();

    const slotToFetch = lastProcessedSlot
      ? lastProcessedSlot.slot + 1
      : oldestLookbackSlot;

    logger.addContext(`for slot ${slotToFetch}`)

    if (slotToFetch > maxSlotToFetch) {
      logger.info(
        `Skipping, slot to fetch ${slotToFetch} is greater than max slot to fetch ${maxSlotToFetch}`
      );
      return;
    }

    const existCommittee = await db_existCommitteeForSlot(slotToFetch);
    if (!existCommittee) {
      logger.info(`Skipping, no committee found for slot ${slotToFetch}.`);
      return;
    }

    return _fetchAttestations(slotToFetch, logger);
  } catch (error) {}
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
    return fetchAttestations(logger).catch((e) =>
      logger.error("TASK-CATCH", e)
    );
  });

  scheduler.addSimpleIntervalJob(
    new SimpleIntervalJob(
      { milliseconds: intervalMs, runImmediately: runImmediately },
      task,
      {
        id,
        preventOverrun,
      }
    )
  );
}
