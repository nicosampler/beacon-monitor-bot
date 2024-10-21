import { summarizeHourly } from "@/src/feed/summarizeHourly.js";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import createLogger from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { getTimestampFromSlotNumber } from "@/src/beacon/utils/time.js";
import { differenceInMinutes, addMinutes } from "date-fns";
import { getOldestLookbackSlot } from "@/src/beacon/utils/misc.js";

const prisma = getPrisma();
const logger = createLogger("summarizeAttestationsHourly");

const HOUR_IN_MIN = 60;

const ID = "summarizeAttestationsHourly";

async function summarizeHourlyTask() {
  try {
    // Get the last summarized attestations timestamp from Summary table
    const summary = await prisma.lastSummaryUpdate.findFirst();

    // If the last summary is not in the db, use the oldest lookback slot
    const startTime =
      !summary || !summary.hourlyValidatorStats
        ? new Date(getTimestampFromSlotNumber(getOldestLookbackSlot()))
        : new Date(summary.hourlyValidatorStats);
    const endTime = addMinutes(startTime, HOUR_IN_MIN);

    // check if the last summary is in the last hour
    const minutesSinceLastSummary = differenceInMinutes(new Date(), startTime);
    if (minutesSinceLastSummary < HOUR_IN_MIN) {
      logger.info("Skipping, still in progress.");
      return;
    }

    logger.info(
      `Summarizing attestations from ${startTime.toISOString()} to ${endTime.toISOString()}`
    );

    await summarizeHourly(startTime, endTime, logger);

    logger.info("Done.");
  } catch (error) {
    logger.error("Error in summarizeAttestationsHourly task", { error });
  }
}

export const job = new SimpleIntervalJob(
  { minutes: 1, runImmediately: true },
  new AsyncTask(`${ID}_task`, summarizeHourlyTask),
  {
    id: ID,
    preventOverrun: true,
  }
);
