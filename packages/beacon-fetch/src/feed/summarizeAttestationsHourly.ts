import createLogger from "@/src/lib/pino.js";
import {
  calculateSlotRange,
  isProcessingTooEarly,
  hasUnprocessedSlots,
  aggregateMissedAttestations,
  processBatchesInTransaction,
} from "@/src/feed/summarizeAttestationsHourlyHelpers.js";

const logger = createLogger("summarizeAttestationsHourly");

export function prepareHourlyStats(startTime: Date) {
  const hour = startTime.getUTCHours();
  const date = new Date(startTime.toISOString().split("T")[0]);
  return { hour, date };
}

export async function summarizeAttestationsHourly(
  startTime: Date,
  endTime: Date
): Promise<void> {
  const { startSlot, endSlot } = calculateSlotRange(startTime, endTime);

  if (await isProcessingTooEarly(endSlot)) {
    return;
  }

  if (await hasUnprocessedSlots(startSlot, endSlot)) {
    logger.info("Some slots are not fully processed. Skipping summarization.");
    return;
  }

  logger.info(`Summarizing attestations from slot ${startSlot} to ${endSlot}`);

  // get the amount of missed attestations for each validator in the slot range
  const committeeValidators = await aggregateMissedAttestations(
    startSlot,
    endSlot
  );
  const { hour, date } = prepareHourlyStats(startTime);

  // update the hourly validator stats
  await processBatchesInTransaction(
    committeeValidators,
    hour,
    date,
    startSlot,
    endSlot,
    endTime
  );

  logger.info(
    `Summarized attestations for hour ${hour} on ${date.toISOString()}`
  );
}
