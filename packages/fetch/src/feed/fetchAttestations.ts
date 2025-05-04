import { Prisma } from '@prisma/client';
import chunk from 'lodash/chunk.js';
import ms from 'ms';

import { getAttestations } from '@/src/beacon/endpoints.js';
import {
  convertBitsToString,
  convertBitsToStringForCommitteeBits,
  convertHexStringToByteArray,
} from '@/src/beacon/utils/bitlist.js';
import { getOldestLookbackSlot } from '@/src/beacon/utils/misc.js';
import { env } from '@/src/env.js';
import { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';

const prisma = getPrisma();

/**
 * Gets the committee validator counts for the last BEACON_SLOTS_PER_EPOCH slots
 * @param slotNumber The current slot number
 * @returns An object where keys are slot numbers and values are committee validator counts
 */
async function getSlotCommitteesValidatorsAmount(slotNumber: number) {
  const slots = await prisma.slot.findMany({
    where: {
      slot: {
        lte: slotNumber,
        gt: slotNumber - env.BEACON_SLOTS_PER_EPOCH * 2,
      },
    },
    select: {
      slot: true,
      committeeValidatorCounts: true,
    },
    orderBy: {
      slot: 'desc',
    },
  });

  return slots.reduce(
    (acc, slot) => {
      acc[slot.slot] = slot.committeeValidatorCounts as number[];
      return acc;
    },
    {} as Record<number, number[]>,
  );
}

export const fetchAttestation = async (slotNumber: number, logger: CustomLogger) => {
  try {
    logger.info(`start.`);

    // Fetch the slot's attestations from the API.
    // If the slot is missed, updates the db and returns [].
    let fetchedAttestations = await getAttestation(slotNumber, logger);
    if (!fetchedAttestations) return;
    // Filter out attestations that are older than the oldest lookback slot
    fetchedAttestations = fetchedAttestations.filter(
      (attestation) => +attestation.data.slot >= getOldestLookbackSlot(),
    );

    // Get amount of validators per committee for the last BEACON_SLOTS_PER_EPOCH slots
    const slotCommitteesValidatorsAmounts = await getSlotCommitteesValidatorsAmount(slotNumber);

    // Process all attestations. Separates them by updates and deletes depending on the attestation delay env.BEACON_MAX_ATTESTATION_DELAY.
    const allUpdates: CommitteeUpdate[] = [];
    const allDeletes: CommitteeUpdate[] = [];
    for (const attestation of fetchedAttestations) {
      const processedAttestations = await processAttestation(
        slotNumber,
        attestation,
        slotCommitteesValidatorsAmounts,
      );
      allUpdates.push(...processedAttestations.updates);
      allDeletes.push(...processedAttestations.deletes);
    }

    // Deduplicate and prioritize deletes over updates
    const { updates: uniqueUpdates, deletes: uniqueDeletes } = deduplicateAttestations(
      allUpdates,
      allDeletes,
    );

    // Update or delete the validators from the committee table
    await updateAndDeleteValidatorAttestations(
      {
        updates: uniqueUpdates,
        deletes: uniqueDeletes,
      },
      slotNumber,
      logger,
    );

    logger.info(`Done for slot ${slotNumber}.`);
  } catch (error) {
    logger.error('There was an error.', error);
    throw error;
  }
};

/**
 * Deduplicates the updates and deletes of the attestations.
 * Some nodes might be delayed producing we might get attestations for a node indicating different delays.
 * We give priority to the attestation with the lowest delay.
 */
function deduplicateAttestations(
  allUpdates: CommitteeUpdate[],
  allDeletes: CommitteeUpdate[],
): AttestationResult {
  // Helper function to check if entry exists
  const entryExists = (arr: CommitteeUpdate[], value: CommitteeUpdate) => {
    return arr.some(
      (entry) =>
        entry.slot === value.slot &&
        entry.index === value.index &&
        entry.aggregationBitsIndex === value.aggregationBitsIndex,
    );
  };

  // Remove duplicates from deletes first (keeping first occurrence)
  const uniqueDeletes = allDeletes.filter(
    (del, index) =>
      allDeletes.findIndex(
        (d) =>
          d.slot === del.slot &&
          d.index === del.index &&
          d.aggregationBitsIndex === del.aggregationBitsIndex,
      ) === index,
  );

  // Filter updates: remove duplicates and any that exist in deletes
  const uniqueUpdates = allUpdates.filter(
    (update, index) =>
      // Keep only first occurrence of each update
      allUpdates.findIndex(
        (u) =>
          u.slot === update.slot &&
          u.index === update.index &&
          u.aggregationBitsIndex === update.aggregationBitsIndex,
      ) === index &&
      // Remove if exists in deletes (deletes take precedence)
      !entryExists(uniqueDeletes, update),
  );

  return {
    updates: uniqueUpdates,
    deletes: uniqueDeletes,
  };
}

async function getAttestation(slot: number, logger: CustomLogger) {
  const fetchedAttestations = await getAttestations(slot + 1);

  if (fetchedAttestations === 'SLOT MISSED') {
    await prisma.slot.update({
      where: { slot: slot },
      data: { attestationsFetched: true },
    });
    logger.info(`slot missed.`);
    return null;
  }

  return fetchedAttestations;
}
type Attestation = NonNullable<Awaited<ReturnType<typeof getAttestation>>>[number];

interface CommitteeUpdate {
  slot: number;
  index: number;
  //validatorIndex: number;
  aggregationBitsIndex: number;
  attestationDelay: number;
}

interface AttestationResult {
  updates: CommitteeUpdate[];
  deletes: CommitteeUpdate[];
}

async function processAttestation(
  slotNumber: number,
  attestation: Attestation,
  slotCommitteesValidatorsAmounts: Record<number, number[]>,
): Promise<AttestationResult> {
  const aggregationBits = convertBitsToString(
    convertHexStringToByteArray(attestation.aggregation_bits),
  );

  const updates: CommitteeUpdate[] = [];
  const deletes: CommitteeUpdate[] = [];

  // Convert committee bits from hex to binary string
  const committeeBits = convertBitsToStringForCommitteeBits(
    convertHexStringToByteArray(attestation.committee_bits),
  );

  const slotCommitteeValidatorsAmount =
    slotCommitteesValidatorsAmounts[Number(attestation.data.slot)];
  if (!slotCommitteeValidatorsAmount) {
    throw `No validator count found for slot ${slotNumber}`;
  }
  let currentAggregationIndex = 0;

  // Process each committee
  for (let committeeBit = 0; committeeBit < committeeBits.length; committeeBit++) {
    const validatorsInCommittee = slotCommitteeValidatorsAmount[committeeBit];

    // Only process committees that contributed to aggregation_bits
    if (committeeBits[committeeBit] === '1') {
      // Get the section of aggregation_bits for this committee
      const committeeAggregationBits = aggregationBits.slice(
        currentAggregationIndex,
        currentAggregationIndex + validatorsInCommittee,
      );

      // Process each validator's attestation in this committee
      for (let i = 0; i < committeeAggregationBits.length; i++) {
        if (committeeAggregationBits[i] === '1') {
          const attestationDelay = slotNumber - Number(attestation.data.slot) - 1;
          const attestationInfo = {
            slot: +attestation.data.slot,
            index: committeeBit,
            aggregationBitsIndex: i,
            attestationDelay,
          };

          if (attestationDelay <= env.BEACON_MAX_ATTESTATION_DELAY) {
            deletes.push(attestationInfo);
          } else {
            updates.push(attestationInfo);
          }
        }
      }

      // Only increment the index if we processed this committee
      currentAggregationIndex += validatorsInCommittee;
    }
  }

  return { updates, deletes };
}

/**
 * After processing the attestations for a slot, update the validators within the Committee table.
 * we are not using primsa.transaction because this process is quite big and consumes a lot of Postgres resources.
 * There is not harm if some updates or deletes are applied partially because the next time the same slot is processed,
 * the missing updates or deletes will be applied.
 */
async function updateAndDeleteValidatorAttestations(
  attestations: AttestationResult,
  slotNumber: number,
  logger: CustomLogger,
): Promise<void> {
  const prismaBatchSize = 5000;

  logger.info(
    `Processing ${attestations.updates.length} updates and ${attestations.deletes.length} deletes.`,
  );

  await prisma.$transaction(
    async (tx) => {
      const queries: Prisma.Sql[] = [];

      // Process updates
      if (attestations.updates.length > 0) {
        const updateChunks = chunk(attestations.updates, prismaBatchSize);
        for (const batchUpdates of updateChunks) {
          const updateQuery = Prisma.sql`
            UPDATE "Committee" c
            SET "attestationDelay" = v.delay
            FROM (VALUES
              ${Prisma.join(
                batchUpdates.map(
                  (u) =>
                    Prisma.sql`(${u.slot}, ${u.index}, ${u.aggregationBitsIndex}, ${u.attestationDelay})`,
                ),
              )}
            ) AS v(slot, index, "aggregationBitsIndex", delay)
            WHERE c.slot = v.slot 
              AND c.index = v.index 
              AND c."aggregationBitsIndex" = v."aggregationBitsIndex";
          `;
          queries.push(updateQuery);
        }
      }

      // Process deletes
      if (attestations.deletes.length > 0) {
        const deleteChunks = chunk(attestations.deletes, prismaBatchSize);
        for (const batchDeletes of deleteChunks) {
          const deleteQuery = Prisma.sql`
            DELETE FROM "Committee" c
            USING (
              VALUES ${Prisma.join(
                batchDeletes.map(
                  (d) => Prisma.sql`(${d.slot}, ${d.index}, ${d.aggregationBitsIndex})`,
                ),
              )}
            ) AS t(slot, index, "aggregationBitsIndex")
            WHERE c.slot = t.slot
              AND c.index = t.index
              AND c."aggregationBitsIndex" = t."aggregationBitsIndex";
          `;
          queries.push(deleteQuery);
        }
      }

      // Execute all queries in parallel
      await Promise.all(queries.map((query) => tx.$executeRaw(query)));

      // Update slot
      return tx.slot.update({
        where: { slot: slotNumber },
        data: { attestationsFetched: true },
      });
    },
    { timeout: ms('1m') },
  );
}
