import chunk from "lodash/chunk.js";
import pRetry from "p-retry";

import { getCommittees } from "@/src/beacon/endpoints.js";
import { getPrisma } from "@/src/lib/prisma.js";
import createLogger, { CustomLogger } from "@/src/lib/pino.js";
import { getOldestLookbackSlot } from "@/src/beacon/utils/misc.js";
import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { env } from "@/src/env.js";
import {
  db_getLastSlotInCommittee,
  db_getLastSlotWithAttestations,
} from "@/src/feed/utils.js";

type Committee = {
  slot: string;
  index: string;
  validators: string[];
};

type CommitteeUpsert = {
  slot: number;
  index: number;
  aggregationBitsIndex: number;
  validatorIndex: number;
};

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
  const headSlot = getSlotNumberFromTimestamp(now.getTime());
  const oldestLookbackSlot = getOldestLookbackSlot();

  const lastSlotInCommittee = await db_getLastSlotInCommittee();

  // only fetch up to one epoch ahead
  if (lastSlotInCommittee?.slot > env.BEACON_SLOTS_PER_EPOCH + headSlot) {
    logger.info(`Skipping, head slot is too far in the future`);
    return [];
  }

  // skip fetching more committees if the last slot with attestations processed is too far in the past
  const lastSlotWithAttestations = await db_getLastSlotWithAttestations();
  if (
    lastSlotInCommittee?.slot - lastSlotWithAttestations?.slot >=
    env.BEACON_SLOTS_PER_EPOCH * 25
  ) {
    logger.info(`Skipping, last slot with attestations is too back in time`);
    return [];
  }

  const baseSlot = lastSlotInCommittee
    ? lastSlotInCommittee.slot + 1
    : oldestLookbackSlot;

  // Generate array of slots to fetch
  // We fetch the first slot of each epoch
  // This relays on the fact that oldestLookbackSlot was the first slot of an epoch
  const slots: number[] = [];
  const maxSlotsToFetch = 5;
  for (let i = 0; i < maxSlotsToFetch; i++) {
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

// Helper function to prepare upsert data
function prepareUpsertData(committees: Committee[]) {
  const uniqueSlots = Array.from(new Set(committees.map((c) => +c.slot)));

  const slotUpserts = uniqueSlots
    .filter((slot) => slot >= getOldestLookbackSlot())
    .map((slot) => ({
      slot,
      attestationsFetched: false,
    }));

  const committeeUpserts = committees.flatMap((committee) =>
    committee.validators
      .map((validatorIndex, index) => ({
        slot: +committee.slot,
        index: +committee.index, // index within the slot
        aggregationBitsIndex: index, // position in the validators array (indexof)
        validatorIndex: +validatorIndex,
      }))
      .filter((committee) => +committee.slot >= getOldestLookbackSlot())
  );

  return {
    uniqueSlots,
    slotUpserts,
    committeeUpserts,
  };
}

// Helper function to execute the transaction
async function executeEpochTransaction(
  uniqueSlots: number[],
  committeeUpserts: CommitteeUpsert[],
  logger: CustomLogger
) {
  // Retry configuration
  const retryOptions = {
    retries: 5,
    factor: 2,
    minTimeout: 1000,
    onFailedAttempt: (error) => {
      logger.warn(`Attempt failed: ${error.message}. Retrying...`);
    },
  };

  // First transaction: Insert slots
  await pRetry(async () => {
    await prisma.$executeRaw`
          INSERT INTO "Slot" (slot, "attestationsFetched")
          SELECT unnest(${uniqueSlots}::integer[]), false
          ON CONFLICT (slot) DO NOTHING
        `;
  }, retryOptions);

  // Second transaction: Insert committees in batches
  const batchSize = 5000;
  const batches = chunk(committeeUpserts, batchSize);
  for (const batch of batches) {
    await pRetry(async () => {
      await prisma.committee.createMany({
        data: batch,
        skipDuplicates: true,
      });
    }, retryOptions);
  }
}

async function processAndSaveCommittees(
  logger: CustomLogger,
  committees: Committee[]
): Promise<void> {
  const preparedData = prepareUpsertData(committees);

  logCommitteeInfo(logger, committees, preparedData.slotUpserts);

  await executeEpochTransaction(
    preparedData.uniqueSlots,
    preparedData.committeeUpserts,
    logger
  );

  logger.info(
    `Successfully processed committees for slot ${committees[0]?.slot}`
  );
}

// New helper function
async function fetchCommitteesForSlots(
  logger: CustomLogger,
  slotsToFetch: number[]
) {
  logger.info(`Fetching committees for slots: ${slotsToFetch.join(", ")}`);

  const fetchPromises = slotsToFetch.map(async (slotToFetch) => {
    try {
      const committees = await getCommittees(slotToFetch);
      return {
        slot: slotToFetch,
        success: true,
        committees: committees.filter((c) => +c.slot >= slotToFetch),
      };
    } catch (error) {
      return { slot: slotToFetch, success: false, error };
    }
  });

  const results = await Promise.all(fetchPromises);

  // Only keep sequential successful results
  const validResults: { slot: number; committees: Committee[] }[] = [];
  for (const result of results) {
    if (!result.success) break;
    validResults.push({ slot: result.slot, committees: result.committees });
  }

  if (validResults.length === 0) {
    logger.error("No results from committee fetch", {});
  }

  return validResults;
}

// New function to handle parallel fetching
export async function fetchNextCommittees(): Promise<void> {
  const logger = createLogger("FetchCommittees", false);

  try {
    const slotsToFetch = await getNextSlotsToFetch(logger);
    if (slotsToFetch.length === 0) {
      return;
    }

    // send all the API request in parallel
    const committees = await fetchCommitteesForSlots(logger, slotsToFetch);
    // process and save the committees sequentially
    // if there is an error, the loop will break
    if (committees.length > 0) {
      logger.info(`Saving committees...`);
      for (const result of committees) {
        try {
          await processAndSaveCommittees(logger, result.committees);
        } catch (error) {
          logger.error(
            `Error saving slots/committees (fully or partially) for slot ${result.slot}`,
            error
          );
          break;
        }
      }
    }

    logger.info(`Done!`);
  } catch (error) {
    logger.error("Error in fetchNextCommittees", error);
    throw error;
  }
}
