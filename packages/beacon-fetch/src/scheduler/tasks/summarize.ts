import { summarizeAttestationsHourly } from "@/src/feed/summarizeAttestationsHourly.js";
import { AsyncTask } from "toad-scheduler";
import createLogger from "@/src/lib/pino.js";
import { env } from "@/src/env.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { getTimestampFromSlotNumber } from "@/src/beacon/utils/time.js";
import { addHours } from "date-fns";

const prisma = getPrisma();
const logger = createLogger("summarizeAttestationsHourly");

export async function summarizeAttestationsHourlyTask() {
  try {
    // Get the last summarized attestations timestamp from Summary table
    const summary = await prisma.lastSummaryUpdate.findFirst();

    const nextSummaryStart =
      !summary || !summary.hourlyValidatorStats
        ? new Date(getTimestampFromSlotNumber(env.BEACON_LOOKBACK_SLOT))
        : new Date(summary.hourlyValidatorStats);
    const nextSummaryEnd = addHours(nextSummaryStart, 1);

    const now = new Date();

    if (nextSummaryEnd > now) {
      logger.info("Skipping, still in progress.");
      return;
    }

    logger.info(
      `Summarizing attestations from ${nextSummaryStart.toISOString()} to ${nextSummaryEnd.toISOString()}`
    );

    await summarizeAttestationsHourly(nextSummaryStart, nextSummaryEnd);

    logger.info(`Done`);
  } catch (error) {
    logger.error("Error in summarizeAttestationsHourly task", { error });
  }
}

export const callSummarizeAttestationsHourly = new AsyncTask(
  "summarizeAttestationsHourly",
  summarizeAttestationsHourlyTask
);
