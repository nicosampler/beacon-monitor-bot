import chunk from 'lodash/chunk.js';
import ms from 'ms';

import { getCommittees } from '@/src/beacon/endpoints.js';
import { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';

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
  slotUpserts: Array<{ slot: number }>,
): void {
  const groupedCommittees = fetchedCommittees.reduce(
    (acc, committee) => {
      if (!acc[committee.slot]) {
        acc[committee.slot] = [];
      }
      acc[committee.slot]!.push(+committee.index);
      return acc;
    },
    {} as Record<string, number[]>,
  );

  const logMessage = Object.entries(groupedCommittees)
    .map(([slot, indexes]) => `${slot}:${indexes.length}`)
    .join(',');

  logger.info(`New slots (${slotUpserts.length}) - Committees: ${logMessage || 'null'}`);
}

// Helper function to prepare upsert data
function prepareUpsertData(_committees: Committee[], lastSlot: number) {
  // filter out committees that are not already in the committee table
  // as the response from the API contains slots previous to the fetchedSlot
  const committees = _committees.filter((c) => Number(c.slot) > lastSlot);

  const uniqueSlots = Array.from(new Set(committees.map((c) => +c.slot)));

  const newSlots = uniqueSlots.map((slot) => ({
    slot,
    attestationsFetched: false,
  }));

  const newCommittees = committees.flatMap((committee) =>
    committee.validators.map((validatorIndex, index) => ({
      slot: +committee.slot,
      index: +committee.index, // index within the slot
      aggregationBitsIndex: index, // position in the validators array (indexOf)
      validatorIndex: +validatorIndex,
    })),
  );

  return {
    uniqueSlots,
    newSlots,
    newCommittees,
  };
}

// Helper function to execute the transaction
async function executeEpochTransaction(uniqueSlots: number[], committeeUpserts: CommitteeUpsert[]) {
  // Calculate committee counts for each slot
  const committeeCounts = new Map<number, number[]>();
  for (const u of committeeUpserts) {
    if (!committeeCounts.has(u.slot)) {
      committeeCounts.set(u.slot, []);
    }
    const slotCounts = committeeCounts.get(u.slot)!;
    slotCounts[u.index] = (slotCounts[u.index] || 0) + 1;
  }

  // Execute everything in a single transaction with timeout
  await prisma.$transaction(
    async (tx) => {
      // First: Insert slots with committee counts
      await tx.$executeRaw`
        INSERT INTO "Slot" (slot, "attestationsFetched", "committeeValidatorCounts")
        SELECT 
          unnest(${uniqueSlots}::integer[]), 
          false,
          unnest(${uniqueSlots.map((slot) => JSON.stringify(committeeCounts.get(slot) || []))}::jsonb[])
        ON CONFLICT (slot) DO UPDATE SET
          "committeeValidatorCounts" = EXCLUDED."committeeValidatorCounts"
      `;

      // Second: Create temporary table for bulk insert
      await tx.$executeRaw`
        CREATE TEMPORARY TABLE "temp_committee" (
          slot INT,
          index INT,
          "aggregationBitsIndex" INT,
          "validatorIndex" INT
        ) ON COMMIT DROP
      `;

      // Third: Insert data into temporary table
      const batchSize = 10000;
      const batches = chunk(committeeUpserts, batchSize);
      for (const batch of batches) {
        const values = batch
          .map((c) => `(${c.slot}, ${c.index}, ${c.aggregationBitsIndex}, ${c.validatorIndex})`)
          .join(',');

        await tx.$executeRawUnsafe(`
          INSERT INTO "temp_committee" (slot, index, "aggregationBitsIndex", "validatorIndex")
          VALUES ${values}
        `);
      }

      await tx.$executeRaw`
        INSERT INTO "Committee" (slot, index, "aggregationBitsIndex", "validatorIndex")
        SELECT tc.slot, tc.index, tc."aggregationBitsIndex", tc."validatorIndex"
        FROM "temp_committee" tc
        ON CONFLICT (slot, index, "aggregationBitsIndex") DO NOTHING
      `;
    },
    {
      timeout: ms('1m'),
    },
  );
}

// New function to handle parallel fetching
export async function fetchCommittee(
  logger: CustomLogger,
  epochToFetch: number,
  lastSlot: number,
): Promise<void> {
  const committees = await getCommittees(epochToFetch);
  const preparedData = prepareUpsertData(committees, lastSlot);
  logCommitteeInfo(logger, committees, preparedData.newSlots);
  await executeEpochTransaction(preparedData.uniqueSlots, preparedData.newCommittees);
}
