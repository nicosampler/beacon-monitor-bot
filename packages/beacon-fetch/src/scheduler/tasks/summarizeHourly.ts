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
    const now = new Date();
    const nowMinus1 = subHours(now, 1);

    if (lastSummaryDate < nowMinus1) {
      logger.info("Skipping, still in progress.");
      return;
    }

    const nextSummaryDate = addHours(lastSummaryDate, 1);

    logger.info(`Summarizing hourly stats for ${nextSummaryDate}`);

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
