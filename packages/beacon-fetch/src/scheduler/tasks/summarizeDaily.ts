import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import createLogger from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { getTimestampFromSlotNumber } from "@/src/beacon/utils/time.js";
import { addDays, differenceInHours } from "date-fns";
import { getOldestLookbackSlot } from "@/src/beacon/utils/misc.js";
import { summarizeDaily } from "@/src/feed/summarizeDaily.js";
import { convertToUTC } from "@/src/utils/date/index.js";

const prisma = getPrisma();
const ID = "Summarize:Daily";
const logger = createLogger(ID);
const HOURS_IN_DAY = 24;

const oldestLookbackSlotDate = new Date(
  getTimestampFromSlotNumber(getOldestLookbackSlot())
);

async function summarizeDailyTask() {
  try {
    // Get the last summarized attestations timestamp from Summary table
    const summary = await prisma.lastSummaryUpdate.findFirst();

    // If the last summary is not in the db, use the oldest lookback slot
    const lastProcessedDay = summary?.dailyValidatorStats
      ? summary.dailyValidatorStats
      : oldestLookbackSlotDate;

    const dayToProcess = addDays(lastProcessedDay, 1);

    // make sure we always have data for the last 2 days.
    // Note that performance is calculated on an daily basis, so we need to make sure
    // we have data for the last day. So we only summarize if have passed 2 days since the last summary.
    const hoursSinceLastSummary = differenceInHours(new Date(), dayToProcess);
    if (hoursSinceLastSummary < HOURS_IN_DAY * 2) {
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
  { minutes: 5, runImmediately: true },
  new AsyncTask(`${ID}_task`, summarizeDailyTask),
  {
    id: ID,
    preventOverrun: true,
  }
);
