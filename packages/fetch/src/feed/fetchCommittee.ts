import { chunk } from 'lodash';

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

  // First transaction: Insert slots with committee counts
  await prisma.$executeRaw`
    INSERT INTO "Slot" (slot, "attestationsFetched", "committeeValidatorCounts")
    SELECT 
      unnest(${uniqueSlots}::integer[]), 
      false,
      unnest(${uniqueSlots.map((slot) => JSON.stringify(committeeCounts.get(slot) || []))}::jsonb[])
    ON CONFLICT (slot) DO UPDATE SET
      "committeeValidatorCounts" = EXCLUDED."committeeValidatorCounts"
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
