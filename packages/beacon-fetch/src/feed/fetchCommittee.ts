import chunk from "lodash/chunk.js";
import pRetry from "p-retry";

import { getCommittees } from "@/src/beacon/endpoints.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { CustomLogger } from "@/src/lib/pino.js";

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

  logger.info(
    `New slots (${slotUpserts.length}) - Committees: ${logMessage || "null"}`
  );
}

// Helper function to prepare upsert data
function prepareUpsertData(
  _committees: Committee[],
  lastSlotInCommittee: number
) {
  // filter out committees that are not already in the committee table
  // as the response from the API contains slots previous to the fetchedSlot
  const committees = _committees.filter((c) => +c.slot >= lastSlotInCommittee);

  const uniqueSlots = Array.from(new Set(committees.map((c) => +c.slot)));

  const slotUpserts = uniqueSlots.map((slot) => ({
    slot,
    attestationsFetched: false,
  }));

  const committeeUpserts = committees.flatMap((committee) =>
    committee.validators.map((validatorIndex, index) => ({
      slot: +committee.slot,
      index: +committee.index, // index within the slot
      aggregationBitsIndex: index, // position in the validators array (indexOf)
      validatorIndex: +validatorIndex,
    }))
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
  committeeUpserts: CommitteeUpsert[]
) {
  await prisma.$executeRaw`
      INSERT INTO "Slot" (slot, "attestationsFetched")
      SELECT unnest(${uniqueSlots}::integer[]), false
      ON CONFLICT (slot) DO NOTHING
    `;

  // Second transaction: Insert committees in batches
  const batchSize = 10000;
  const batches = chunk(committeeUpserts, batchSize);
  for (const batch of batches) {
    await prisma.committee.createMany({
      data: batch,
      skipDuplicates: true,
    });
  }
}

async function processAndSaveCommittees(
  logger: CustomLogger,
  lastSlotInCommittee: number,
  committees: Committee[]
): Promise<void> {
  const preparedData = prepareUpsertData(committees, lastSlotInCommittee);

  logCommitteeInfo(logger, committees, preparedData.slotUpserts);

  await executeEpochTransaction(
    preparedData.uniqueSlots,
    preparedData.committeeUpserts
  );
}

// New function to handle parallel fetching
export async function fetchCommittee(
  logger: CustomLogger,
  slotToFetchEpoch: number,
  lastSlotInCommittee: number
): Promise<void> {
  const committees = await getCommittees(slotToFetchEpoch);
  await processAndSaveCommittees(logger, lastSlotInCommittee, committees);
}
