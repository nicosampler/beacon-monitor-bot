import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import createLogger from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { getTimestampFromSlotNumber } from "@/src/beacon/utils/time.js";
import { addDays } from "date-fns";
import { getOldestLookbackSlot } from "@/src/beacon/utils/misc.js";
import { summarizeDaily } from "@/src/feed/summarizeDaily.js";
import { convertToUTC } from "@/src/utils/date/index.js";

const prisma = getPrisma();
const ID = "Summarize:Daily";
const logger = createLogger(ID);

const oldestLookbackSlotDate = new Date(
  getTimestampFromSlotNumber(getOldestLookbackSlot())
);

async function summarizeDailyTask() {
  try {
    // Get the last summarized attestations timestamp from Summary table
    const summary = await prisma.lastSummaryUpdate.findFirst();

    // If the last summary is not in the db, use the oldest lookback slot
    const dayToProcess = summary?.dailyValidatorStats ?? oldestLookbackSlotDate;

    // Make sure the hourly summary stats have been processed
    // so we check that hourlyValidatorStats is greater than the day we want to process
    if (summary?.hourlyValidatorStats < addDays(dayToProcess, 1)) {
      logger.info("Skipping, still in progress.");
      return;
    }

    const { date, day } = convertToUTC(dayToProcess);

    logger.info(`Summarizing daily stats for ${date}`);

    await summarizeDaily(new Date(date), day, logger);

    logger.info("Done.");
  } catch (error) {
    logger.error("Error in summarizeAttestationsDaily task", { error });
  }
}

export const job = new SimpleIntervalJob(
  { minutes: 10, runImmediately: false },
  new AsyncTask(`${ID}_task`, summarizeDailyTask),
  {
    id: ID,
    preventOverrun: true,
  }
);
