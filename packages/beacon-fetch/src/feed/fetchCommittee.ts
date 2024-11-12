import chunk from "lodash/chunk.js";
import ms from "ms";

import { getCommittees } from "@/src/beacon/endpoints.js";
import { getPrisma } from "@/src/lib/prisma.js";
import createLogger, { CustomLogger } from "@/src/lib/pino.js";
import { getOldestLookbackSlot } from "@/src/beacon/utils/misc.js";
import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { env } from "@/src/env.js";

const prisma = getPrisma();

// Updated function to log committee information
function logCommitteeInfo(
  logger: CustomLogger,
  fetchedCommittees: Array<{
    slot: string;
    index: string;
    validators: string[];
  }>,
  slotUpserts: Array<{ slot: number }>
): void {
  const groupedCommittees = fetchedCommittees.reduce(
    (acc, committee) => {
      if (!acc[committee.slot]) {
        acc[committee.slot] = [];
      }
      acc[committee.slot].push(+committee.index);
      return acc;
    },
    {} as Record<string, number[]>
  );

  const logMessage = Object.entries(groupedCommittees)
    .map(([slot, indexes]) => `${slot}:${indexes.length}`)
    .join(",");

  logger.info(`New slots (${slotUpserts.length}) - Committees: ${logMessage}`);
}

// Add new function to calculate next slots to fetch
async function getNextSlotsToFetch(logger: CustomLogger): Promise<number[]> {
  const now = new Date();
  const currentSlot = getSlotNumberFromTimestamp(now.getTime());
  const headSlot = currentSlot - 1;
  const oldestLookbackSlot = getOldestLookbackSlot();

  const lastSlotWithAttestations = await prisma.slot.findFirst({
    where: { attestationsFetched: true },
    orderBy: { slot: "desc" },
  });

  const lastSlotInCommittee = await prisma.committee.findFirst({
    orderBy: { slot: "desc" },
  });

  if (
    lastSlotInCommittee?.slot - lastSlotWithAttestations?.slot >=
    env.BEACON_SLOTS_PER_EPOCH * 20
  ) {
    logger.info(`Skipping, last slot with attestations is too back in time`);
    return [];
  }

  const baseSlot = lastSlotInCommittee
    ? lastSlotInCommittee.slot + 1
    : oldestLookbackSlot;

  // Generate array of slots to fetch
  // We fetch the first slot of each epoch
  // This relays on the fact that the oldest lookback slot was the first slot of an epoch
  const slots: number[] = [];
  for (let i = 0; i < 10; i++) {
    const slotToFetch = baseSlot + i * env.BEACON_SLOTS_PER_EPOCH;
    if (slotToFetch <= headSlot) {
      slots.push(slotToFetch);
    } else {
      break;
    }
  }

  logger.info(`Slots to fetch: ${slots.join(", ")}`);
  return slots;
}

// New function to handle database operations for a single slot
async function processAndSaveCommittees(
  logger: CustomLogger,
  committees: Array<{ slot: string; index: string; validators: string[] }>
): Promise<void> {
  try {
    // Get unique slots from the committees
    const uniqueSlotsInCommittees = Array.from(
      new Set(committees.map((c) => +c.slot))
    );

    // Prepare slots upsert
    const slotUpserts = uniqueSlotsInCommittees
      .filter((slot) => slot >= getOldestLookbackSlot())
      .map((slot) => ({
        slot,
        attestationsFetched: false,
      }));

    // Updated committee upsert
    const committeeUpserts = committees.flatMap((committee) =>
      committee.validators
        .map((validatorIndex, index) => ({
          slot: +committee.slot,
          index: +committee.index,
          aggregationBitsIndex: index,
          validatorIndex: +validatorIndex,
        }))
        .filter((committee) => +committee.slot >= getOldestLookbackSlot())
    );

    if (!slotUpserts.length && !committeeUpserts.length) {
      logger.info(`Nothing to save for slot ${committees[0].slot}`);
      return;
    }

    logCommitteeInfo(logger, committees, slotUpserts);

    // Save to database in transaction
    await prisma.$transaction(
      async (tx) => {
        // Slot upserts
        const slotPromises = uniqueSlotsInCommittees.map((slot) =>
          tx.slot.upsert({
            where: { slot },
            update: {}, // No update needed if it exists
            create: { slot, attestationsFetched: false },
          })
        );
        await Promise.all(slotPromises);

        // Committee creations
        const batchSize = 5000;
        const batches = chunk(committeeUpserts, batchSize);
        for (const batch of batches) {
          await tx.committee.createMany({
            data: batch,
            skipDuplicates: true,
          });
        }
      },
      {
        timeout: ms("1m"),
      }
    );

    logger.info(`Successfully processed slot ${committees[0].slot}`);
  } catch (error) {
    logger.error(`Failed to process slot ${committees[0].slot}`, error);
    throw error;
  }
}

// New function to handle parallel fetching
export async function fetchNextCommittees(): Promise<void> {
  const logger = createLogger("FetchCommittees", false);

  try {
    const slotsToFetch = await getNextSlotsToFetch(logger);
    if (slotsToFetch.length === 0) {
      logger.info("No slots to fetch");
      return;
    }

    // First, fetch all committees in parallel
    logger.info(`Fetching committees for slots: ${slotsToFetch.join(", ")}`);
    const fetchPromises = slotsToFetch.map(async (slot) => {
      try {
        const committees = await getCommittees(slot);
        return { slot, success: true, committees };
      } catch (error) {
        return { slot, success: false, error };
      }
    });

    const results = await Promise.all(fetchPromises);

    // Only keep sequential successful results
    const validResults = [];
    for (const result of results) {
      if (!result.success) break;
      validResults.push(result);
    }

    if (validResults.length === 0) {
      logger.error("All committee fetches failed", {});
      return;
    }

    logger.info(`Saving committees...`);
    // Process each successful result sequentially
    for (const result of validResults) {
      try {
        await processAndSaveCommittees(logger, result.committees);
      } catch (error) {
        logger.error(`Error saving committees for slot ${result.slot}`, error);
        // Stop processing remaining slots if one fails
        break;
      }
    }

    logger.info(`Done!`);
  } catch (error) {
    logger.error("Error in fetchNextCommittees", error);
    throw error;
  }
}
