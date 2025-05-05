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
    const attestations: CommitteeUpdate[] = [];
    for (const attestation of fetchedAttestations) {
      const updates = await processAttestation(
        slotNumber,
        attestation,
        slotCommitteesValidatorsAmounts,
        attestations,
      );
      attestations.push(...updates);
    }

    // Update or delete the validators from the committee table
    await persistToDB(attestations, slotNumber, logger);

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

async function processAttestation(
  slotNumber: number,
  attestation: Attestation,
  slotCommitteesValidatorsAmounts: Record<number, number[]>,
  existingUpdates: CommitteeUpdate[],
) {
  const aggregationBits = convertBitsToString(
    convertHexStringToByteArray(attestation.aggregation_bits),
  );

  const updates: CommitteeUpdate[] = [];

  // Convert committee bits from hex to binary string
  const committeeBits = convertBitsToStringForCommitteeBits(
    convertHexStringToByteArray(attestation.committee_bits),
  );

  const attestationSlot = Number(attestation.data.slot);

  const slotCommitteeValidatorsAmount = slotCommitteesValidatorsAmounts[attestationSlot];
  if (!slotCommitteeValidatorsAmount) {
    throw `No validator count found for slot ${attestationSlot}`;
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
          const attestationDelay = slotNumber - attestationSlot;
          const attestationInfo = {
            slot: attestationSlot,
            index: committeeBit,
            aggregationBitsIndex: i,
            attestationDelay,
          };

          // Check if this attestation already exists in existingUpdates
          const existingIndex = existingUpdates.findIndex(
            (u) =>
              u.slot === attestationInfo.slot &&
              u.index === attestationInfo.index &&
              u.aggregationBitsIndex === attestationInfo.aggregationBitsIndex,
          );

          // Only add if it doesn't exist or if the new delay is lower
          if (
            existingIndex === -1 ||
            attestationInfo.attestationDelay < existingUpdates[existingIndex].attestationDelay
          ) {
            updates.push(attestationInfo);
          }
        }
      }

      // Only increment the index if we processed this committee
      currentAggregationIndex += validatorsInCommittee;
    }
  }

  return updates;
}

/**
 * After processing the attestations for a slot, update the validators within the Committee table.
 * we are not using primsa.transaction because this process is quite big and consumes a lot of Postgres resources.
 * There is not harm if some updates or deletes are applied partially because the next time the same slot is processed,
 * the missing updates or deletes will be applied.
 */
async function persistToDB(
  attestations: CommitteeUpdate[],
  slotNumber: number,
  logger: CustomLogger,
): Promise<void> {
  logger.info(`Processing ${attestations.length} updates.`);

  await prisma.$transaction(
    async (tx) => {
      const queries: Prisma.Sql[] = [];

      // Process updates
      if (attestations.length > 0) {
        const updateChunks = chunk(attestations, 7000);
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
              AND c."aggregationBitsIndex" = v."aggregationBitsIndex"
              AND c."attestationDelay" IS NULL;
          `;
          queries.push(updateQuery);
        }
      }

      // Execute all queries in parallel
      await Promise.all(queries.map((query) => tx.$executeRaw(query)));

      // Update slot
      await tx.slot.update({
        where: { slot: slotNumber },
        data: { attestationsFetched: true },
      });
    },
    { timeout: ms('1m') },
  );
}
