import { summarizeHourly } from "@/src/feed/summarizeHourly.js";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import createLogger from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { getTimestampFromSlotNumber } from "@/src/beacon/utils/time.js";
import { addHours, subHours } from "date-fns";
import { getOldestLookbackSlot } from "@/src/beacon/utils/misc.js";

const prisma = getPrisma();
const ID = "Summarize:Hourly";
const logger = createLogger(ID);

const oldestLookbackSlotDate = new Date(
  getTimestampFromSlotNumber(getOldestLookbackSlot())
);

async function summarizeHourlyTask() {
  try {
    const summary = await prisma.lastSummaryUpdate.findFirst();

    const lastSummaryDate =
      summary?.hourlyValidatorStats ?? oldestLookbackSlotDate;
    const nextSummaryDate = addHours(lastSummaryDate, 1);

    const now = new Date();
    const oneHourBefore = subHours(now, 1);

    logger.info(
      `lastSummaryDate: ${lastSummaryDate}, nextSummaryDate: ${nextSummaryDate}, oneHourBefore: ${oneHourBefore}`
    );

    // We should only summarize data that is older than 1 hour
    // Examples:
    // Case 1 - Skip:
    //   now = 12:00
    //   nowMinus1h = 11:00
    //   nextSummaryDate = 11:00
    //   Skip because we can't process data from 11:00 yet
    //
    // Case 2 - Process:
    //   now = 12:00
    //   nowMinus1h = 11:00
    //   nextSummaryDate = 10:00
    //   Process because 10:00 is older than 11:00 (data is complete)
    if (nextSummaryDate > oneHourBefore) {
      logger.info("Skipping, data is too recent (less than 1 hour old)");
      return;
    }

    await summarizeHourly(lastSummaryDate, nextSummaryDate, logger);

    logger.info("Done.");
  } catch (error) {
    logger.error("Error in summarizeAttestationsHourly task", { error });
  }
}

export const job = new SimpleIntervalJob(
  { minutes: 5, runImmediately: true },
  new AsyncTask(`${ID}_task`, summarizeHourlyTask),
  {
    id: ID,
    preventOverrun: true,
  }
);
