import { summarizeAttestationsHourly } from "@/src/feed/summarizeAttestationsHourly.js";
import { AsyncTask } from "toad-scheduler";
import createLogger from "@/src/lib/pino.js";
import { env } from "@/src/env.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { getTimestampFromSlotNumber } from "@/src/beacon/utils/time.js";
import {
  addHours,
  startOfHour,
  differenceInHours,
  differenceInMinutes,
  addMinutes,
} from "date-fns";
import { getOldestLookbackSlot } from "@/src/beacon/utils/misc.js";

const prisma = getPrisma();
const logger = createLogger("summarizeAttestationsHourly");

const SUMMARY_INTERVAL_IN_MIN = 3;

export async function summarizeAttestationsHourlyTask() {
  try {
    // Get the last summarized attestations timestamp from Summary table
    const summary = await prisma.lastSummaryUpdate.findFirst();

    const startTime =
      !summary || !summary.hourlyValidatorStats
        ? new Date(getTimestampFromSlotNumber(getOldestLookbackSlot()))
        : new Date(summary.hourlyValidatorStats);

    const now = new Date();

    const minutesSinceLastSummary = differenceInMinutes(now, startTime);

    if (minutesSinceLastSummary < SUMMARY_INTERVAL_IN_MIN) {
      logger.info("Skipping, still in progress.");
      return;
    }

    const endTime = addMinutes(startTime, SUMMARY_INTERVAL_IN_MIN);

    logger.info(
      `Summarizing attestations from ${startTime.toISOString()} to ${endTime.toISOString()}`
    );

    await summarizeAttestationsHourly(startTime, endTime);

    logger.info(`Done`);
  } catch (error) {
    logger.error("Error in summarizeAttestationsHourly task", { error });
  }
}

export const callSummarizeAttestationsHourly = new AsyncTask(
  "summarizeAttestationsHourly",
  summarizeAttestationsHourlyTask
);
