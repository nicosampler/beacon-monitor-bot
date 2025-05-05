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
    for (const attestation of fetchedAttestations) {
      const processedAttestations = await processAttestation(
        slotNumber,
        attestation,
        slotCommitteesValidatorsAmounts,
      );
      allUpdates.push(...processedAttestations.updates);
    }

    // if there are duplicates, keep the one with the lowest delay
    const uniqueUpdates = allUpdates.reduce((acc, update) => {
      const existingIndex = acc.findIndex(
        (u) =>
          u.slot === update.slot &&
          u.index === update.index &&
          u.aggregationBitsIndex === update.aggregationBitsIndex,
      );

      if (existingIndex === -1) {
        // If no duplicate exists, add the update
        acc.push(update);
      } else if (update.attestationDelay < acc[existingIndex].attestationDelay) {
        // If duplicate exists and new update has lower delay, replace it
        acc[existingIndex] = update;
      }

      return acc;
    }, [] as CommitteeUpdate[]);

    // Update or delete the validators from the committee table
    await updateAndDeleteValidatorAttestations(
      {
        updates: uniqueUpdates,
        deletes: [],
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

  const slot = Number(attestation.data.slot);

  const slotCommitteeValidatorsAmount = slotCommitteesValidatorsAmounts[slot];
  if (!slotCommitteeValidatorsAmount) {
    throw `No validator count found for slot ${slot}`;
  }

  // Process each committee
  let currentAggregationIndex = 0;
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
          const attestationDelay = slotNumber - slot - 1;
          const attestationInfo = {
            slot: slot,
            index: committeeBit,
            aggregationBitsIndex: i,
            attestationDelay,
          };
          updates.push(attestationInfo);
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
  logger.info(
    `Processing ${attestations.updates.length} updates and ${attestations.deletes.length} deletes.`,
  );

  await prisma.$transaction(
    async (tx) => {
      const queries: Prisma.Sql[] = [];

      // Process updates
      if (attestations.updates.length > 0) {
        const updateChunks = chunk(attestations.updates, 10000);
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
        const deleteChunks = chunk(attestations.deletes, 10000);
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
