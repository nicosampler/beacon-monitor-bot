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
import { db_getSlotCommitteesValidatorsAmount } from '@/src/feed/utils.js';
import { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';

const prisma = getPrisma();

export const fetchAttestation = async (slotNumber: number, logger: CustomLogger) => {
  try {
    const totalStartTime = performance.now();
    logger.info(`start.`);

    // Fetch the slot's attestations
    const fetchStartTime = performance.now();
    let fetchedAttestations = await getAttestation(slotNumber, logger);
    const fetchEndTime = performance.now();
    const fetchDurationSeconds = (fetchEndTime - fetchStartTime) / 1000;
    logger.info(`[PERF] Fetch attestations took ${fetchDurationSeconds.toFixed(2)}s`);

    if (!fetchedAttestations) return;

    // Filter out attestations that are older than the oldest lookback slot
    // This is important to handle the base case for which we won't have epoch, committee, etc.
    const filterStartTime = performance.now();
    fetchedAttestations = fetchedAttestations.filter(
      (attestation) => +attestation.data.slot >= getOldestLookbackSlot(),
    );
    const filterEndTime = performance.now();
    const filterDurationSeconds = (filterEndTime - filterStartTime) / 1000;
    logger.info(
      `[PERF] Filter attestations took ${filterDurationSeconds.toFixed(2)}s (filtered ${fetchedAttestations.length} attestations)`,
    );

    // Get amount of validators per committee
    const dbQueryStartTime = performance.now();
    const slotCommitteesValidatorsAmounts = await db_getSlotCommitteesValidatorsAmount(slotNumber);
    const dbQueryEndTime = performance.now();
    const dbQueryDurationSeconds = (dbQueryEndTime - dbQueryStartTime) / 1000;
    logger.info(
      `[PERF] Get slot committees validators amount took ${dbQueryDurationSeconds.toFixed(2)}s`,
    );

    // The beacon request brings attestations for different slots.
    // we need to process each of them and calculate the delay for each attestation.
    const processingStartTime = performance.now();
    const attestations: CommitteeUpdate[] = [];
    for (const attestation of fetchedAttestations) {
      const updates = await processAttestation(
        slotNumber,
        attestation,
        slotCommitteesValidatorsAmounts,
      );
      attestations.push(...updates);
    }
    const processingEndTime = performance.now();
    const processingDurationSeconds = (processingEndTime - processingStartTime) / 1000;
    logger.info(
      `[PERF] Process attestations took ${processingDurationSeconds.toFixed(2)}s (processed ${fetchedAttestations.length} attestations, generated ${attestations.length} updates)`,
    );

    // remove duplicates
    const dedupStartTime = performance.now();
    const uniqueAttestations = new Map<string, CommitteeUpdate>();
    for (const attestation of attestations) {
      const key = `${attestation.slot}-${attestation.index}-${attestation.aggregationBitsIndex}`;
      const existing = uniqueAttestations.get(key);

      if (!existing || attestation.attestationDelay < existing.attestationDelay) {
        uniqueAttestations.set(key, attestation);
      }
    }
    const deduplicatedAttestations = Array.from(uniqueAttestations.values());
    const dedupEndTime = performance.now();
    const dedupDurationSeconds = (dedupEndTime - dedupStartTime) / 1000;
    logger.info(
      `[PERF] Deduplication took ${dedupDurationSeconds.toFixed(2)}s (${attestations.length} -> ${deduplicatedAttestations.length} unique)`,
    );

    // Update committee table
    const persistStartTime = performance.now();
    await persistToDB(deduplicatedAttestations, slotNumber, logger);
    const persistEndTime = performance.now();
    const persistDurationSeconds = (persistEndTime - persistStartTime) / 1000;
    logger.info(`[PERF] Persist to DB took ${persistDurationSeconds.toFixed(2)}s`);

    const totalEndTime = performance.now();
    const totalDurationSeconds = (totalEndTime - totalStartTime) / 1000;
    logger.info(`[PERF] Total execution time: ${totalDurationSeconds.toFixed(2)}s`);
  } catch (error) {
    logger.error('There was an error.', error);
    throw error;
  }
};

async function getAttestation(slot: number, logger: CustomLogger) {
  const beaconApiStartTime = performance.now();
  const fetchedAttestations = await getAttestations(slot + 1);
  const beaconApiEndTime = performance.now();
  const beaconApiDurationSeconds = (beaconApiEndTime - beaconApiStartTime) / 1000;
  logger.info(`[PERF] Beacon API call took ${beaconApiDurationSeconds.toFixed(2)}s`);

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
) {
  const attestationSlot = Number(attestation.data.slot);

  // aggregation_bits come in a hexadecimal format. we convert it to a binary string.
  // each bit represents if the validator on a committee attested or not. First bit represents the first validator in the committee.
  const aggregationBits = convertBitsToString(
    convertHexStringToByteArray(attestation.aggregation_bits),
  );

  // committee_bits also comes in a hexadecimal format. we convert it to a binary string.
  // each bit represents if the bits bring data for a committee or not.
  const committeeBits = convertBitsToStringForCommitteeBits(
    convertHexStringToByteArray(attestation.committee_bits),
  );

  // we need to know how many validators are in the committee for the slot.
  // so we can extract the correct bits from the aggregation_bits.
  const slotCommitteeValidatorsAmount = slotCommitteesValidatorsAmounts[attestationSlot];
  if (!slotCommitteeValidatorsAmount) {
    throw `No validator count found for slot ${attestationSlot}`;
  }

  const updates: CommitteeUpdate[] = [];

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

          updates.push(attestationInfo);
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
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`
        CREATE TEMP TABLE temp_committee_updates (
          slot INT,
          index INT,
          "aggregationBitsIndex" INT,
          "attestationDelay" INT,
          PRIMARY KEY (slot, index, "aggregationBitsIndex")
        ) ON COMMIT DROP;
      `;

      if (attestations.length > 0) {
        // Fixed chunk size to stay under bind variable limits (~32k params)
        const tempInsertChunkSize = 8000;
        const insertChunks = chunk(attestations, tempInsertChunkSize);
        for (let i = 0; i < insertChunks.length; i++) {
          const batch = insertChunks[i];
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO temp_committee_updates (slot, index, "aggregationBitsIndex", "attestationDelay")
            VALUES ${Prisma.join(
              batch.map(
                (u) =>
                  Prisma.sql`(${u.slot}, ${u.index}, ${u.aggregationBitsIndex}, ${u.attestationDelay})`,
              ),
            )}
          `);
        }
      }

      await tx.$executeRaw`
        UPDATE "Committee" c
        SET "attestationDelay" = t."attestationDelay"
        FROM temp_committee_updates t
        WHERE c.slot = t.slot
          AND c.index = t.index
          AND c."aggregationBitsIndex" = t."aggregationBitsIndex"
          AND (c."attestationDelay" IS NULL OR c."attestationDelay" > t."attestationDelay");
      `;

      // Update slot
      const slotUpdateStartTime = performance.now();
      await tx.slot.update({
        where: { slot: slotNumber },
        data: { attestationsFetched: true },
      });
      const slotUpdateEndTime = performance.now();
      const slotUpdateDurationSeconds = (slotUpdateEndTime - slotUpdateStartTime) / 1000;
      logger.info(`[PERF] Slot update took ${slotUpdateDurationSeconds.toFixed(2)}s`);
    },
    { timeout: ms('1m') },
  );
}
