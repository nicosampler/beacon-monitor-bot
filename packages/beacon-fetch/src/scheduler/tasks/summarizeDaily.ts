import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import createLogger from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { getTimestampFromSlotNumber } from "@/src/beacon/utils/time.js";
import { addDays, subDays } from "date-fns";
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
    const lastSummaryDate =
      summary?.dailyValidatorStats ?? oldestLookbackSlotDate;
    const nextSummaryDate = addDays(lastSummaryDate, 1);

    const now = new Date();
    const oneDayBefore = subDays(now, 1);

    logger.info(
      `lastSummaryDate: ${lastSummaryDate}, nextSummaryDate: ${nextSummaryDate}, oneDayBefore: ${oneDayBefore}`
    );

    // We should only summarize data that is older than 24 hours
    // to ensure we have all hourly data available
    if (nextSummaryDate > oneDayBefore) {
      logger.info("Skipping, data is too recent (less than 24 hours old)");
      return;
    }

    const { date, day } = convertToUTC(lastSummaryDate);

    logger.info(`Summarizing daily stats for ${date}`);

    await summarizeDaily(new Date(date), day, logger);

    logger.info("Done.");
  } catch (error) {
    logger.error("Error in summarizeAttestationsDaily task", error);
  }
}

export const job = new SimpleIntervalJob(
  { hours: 1, runImmediately: true },
  new AsyncTask(`${ID}_task`, () =>
    summarizeDailyTask().catch((e) => logger.error("TASK-CATCH", e))
  ),
  {
    id: ID,
    preventOverrun: true,
  }
);
