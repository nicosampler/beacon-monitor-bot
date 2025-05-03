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
function prepareUpsertData(_committees: Committee[], lastSlotInCommittee: number) {
  // filter out committees that are not already in the committee table
  // as the response from the API contains slots previous to the fetchedSlot
  const committees = _committees.filter((c) => Number(c.slot) > lastSlotInCommittee);

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
  // Prepare arrays for UNNEST
  const slots = [];
  const positions = [];
  const aggBits = [];
  const validators = [];

  // Calculate committee counts for each slot
  const committeeCounts = new Map<number, number[]>();

  for (const u of committeeUpserts) {
    slots.push(u.slot);
    positions.push(u.index);
    aggBits.push(u.aggregationBitsIndex);
    validators.push(u.validatorIndex);

    // Count validators per committee
    if (!committeeCounts.has(u.slot)) {
      committeeCounts.set(u.slot, []);
    }
    const slotCounts = committeeCounts.get(u.slot)!;
    slotCounts[u.index] = (slotCounts[u.index] || 0) + 1;
  }

  // Execute both operations in a single transaction
  await prisma.$transaction([
    // Insert slots with committee counts
    prisma.$executeRaw`
      INSERT INTO "Slot" (slot, "attestationsFetched", "committeeValidatorCounts")
      SELECT 
        unnest(${uniqueSlots}::integer[]), 
        false,
        unnest(${uniqueSlots.map((slot) => JSON.stringify(committeeCounts.get(slot) || []))}::jsonb[])
      ON CONFLICT (slot) DO UPDATE SET
        "committeeValidatorCounts" = EXCLUDED."committeeValidatorCounts"
    `,
    // Insert committees
    prisma.$executeRaw`
      INSERT INTO "Committee"
        (slot, "index", "aggregationBitsIndex", "validatorIndex")
      SELECT 
        UNNEST(${slots}::int[]),
        UNNEST(${positions}::int[]),
        UNNEST(${aggBits}::int[]),
        UNNEST(${validators}::int[])
      ON CONFLICT DO NOTHING
    `,
  ]);
}

// New function to handle parallel fetching
export async function fetchCommittee(
  logger: CustomLogger,
  epochToFetch: number,
  lastSlotInCommittee: number,
): Promise<void> {
  const committees = await getCommittees(epochToFetch);
  const preparedData = prepareUpsertData(committees, lastSlotInCommittee);
  logCommitteeInfo(logger, committees, preparedData.newSlots);
  await executeEpochTransaction(preparedData.uniqueSlots, preparedData.newCommittees);
}
