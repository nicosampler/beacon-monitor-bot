import { summarizeHourly } from "@/src/feed/summarizeHourly.js";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import createLogger from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { getTimestampFromSlotNumber } from "@/src/beacon/utils/time.js";
import { addHours, subHours } from "date-fns";
import { getOldestLookbackSlot } from "@/src/beacon/utils/misc.js";
import { convertToUTC } from "@/src/utils/date/index.js";

const prisma = getPrisma();
const ID = "Summarize:Hourly";
const logger = createLogger(ID);

const oldestLookbackSlotDate = new Date(
  getTimestampFromSlotNumber(getOldestLookbackSlot())
);

const _lastSummaryDate = oldestLookbackSlotDate;
console.log("_lastSummaryDate", _lastSummaryDate);
const _nextSummaryDate = addHours(_lastSummaryDate, 1);
console.log("_nextSummaryDate", _nextSummaryDate);
const { hour, date } = convertToUTC(_nextSummaryDate);
console.log("hour", hour);
console.log("date", date);

async function summarizeHourlyTask() {
  try {
    const summary = await prisma.lastSummaryUpdate.findFirst();

    const lastSummaryDate =
      summary?.hourlyValidatorStats ?? oldestLookbackSlotDate;
    const nextSummaryDate = addHours(lastSummaryDate, 1);

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
    const now = new Date();
    const oneHourBefore = subHours(now, 1);
    if (nextSummaryDate > oneHourBefore) {
      logger.info("Skipping, data is too recent (less than 1 hour old)");
      return;
    }

    logger.info(`Summarizing hourly stats for ${nextSummaryDate}`);

    await summarizeHourly(lastSummaryDate, nextSummaryDate, logger);

    logger.info("Done.");
  } catch (error) {
    logger.error("Error in summarizeAttestationsHourly task", { error });
  }
}

export const job = new SimpleIntervalJob(
  { minutes: 5, runImmediately: false },
  new AsyncTask(`${ID}_task`, summarizeHourlyTask),
  {
    id: ID,
    preventOverrun: true,
  }
);
