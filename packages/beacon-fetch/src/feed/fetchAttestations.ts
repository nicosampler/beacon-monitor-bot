import chunk from "lodash/chunk.js";
import pRetry from "p-retry";

import { getAttestations } from "@/src/beacon/endpoints.js";
import {
  convertBitsToString,
  convertHexStringToByteArray,
} from "@/src/beacon/utils/bitlist.js";
import { db_existCommitteeForSlot } from "@/src/feed/utils.js";
import { CustomLogger } from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { getOldestLookbackSlot } from "@/src/beacon/utils/misc.js";
import { Prisma } from "@prisma/client";
import { env } from "@/src/env.js";

const prisma = getPrisma();

export const fetchAttestation = async (
  _slotNumber: number,
  logger: CustomLogger
) => {
  try {
    logger.info(`start.`);

    const slotNumber = 18596099;

    // Fetch the slot's attestations from the API.
    // If the slot is missed, updates the db and returns [].
    const fetchedAttestations = await getAttestation(slotNumber, logger);
    if (!fetchedAttestations) return;

    // Filter out attestations that are older than the oldest lookback slot
    const filteredAttestations = fetchedAttestations.filter(
      (attestation) => +attestation.data.slot >= getOldestLookbackSlot()
    );

    // Process all attestations. Separates them by updates and deletes depending on the attestation delay env.BEACON_MAX_ATTESTATION_DELAY.
    const allUpdates: CommitteeUpdate[] = [];
    const allDeletes: CommitteeUpdate[] = [];
    for (const attestation of filteredAttestations) {
      const processedAttestations = processAttestation(slotNumber, attestation);
      allUpdates.push(...processedAttestations.updates);
      allDeletes.push(...processedAttestations.deletes);
    }

    // Update or delete the validators from the committee table.
    await updateAndDeleteValidatorAttestations(
      {
        updates: allUpdates,
        deletes: allDeletes,
      },
      slotNumber,
      logger
    );

    logger.info(`Done for slot ${slotNumber}.`);
  } catch (error) {
    logger.error("There was an error.", error);
    throw error;
  }
};

async function getAttestation(slot: number, logger: CustomLogger) {
  const fetchedAttestations = await getAttestations(slot + 1);

  if (fetchedAttestations === "SLOT MISSED") {
    await prisma.slot.update({
      where: { slot: slot },
      data: { attestationsFetched: true },
    });
    logger.info(`slot missed.`);
    return null;
  }

  return fetchedAttestations;
}
type Attestation = NonNullable<
  Awaited<ReturnType<typeof getAttestation>>
>[number];

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

function processAttestation(
  slotNumber: number,
  attestation: Attestation
): AttestationResult {
  const aggregationBits = convertBitsToString(
    convertHexStringToByteArray(attestation.aggregation_bits)
  );

  const updates: CommitteeUpdate[] = [];
  const deletes: CommitteeUpdate[] = [];

  // Iterate through the aggregation bits
  for (let i = 0; i < aggregationBits.length; i++) {
    if (aggregationBits[i] === "1") {
      const attestationDelay = slotNumber - Number(attestation.data.slot);
      const attestationInfo = {
        slot: +attestation.data.slot,
        index: +attestation.data.index,
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
  logger: CustomLogger
): Promise<void> {
  const prismaBatchSize = 5000;

  logger.info(
    `Processing ${attestations.updates.length} updates and ${attestations.deletes.length} deletes.`
  );

  const retryOptions = {
    retries: 5,
    factor: 2,
    minTimeout: 1000,
    onFailedAttempt: (error) => {
      logger.warn(`Attempt failed: ${error.message}. Retrying...`);
    },
  };

  // Process updates
  if (attestations.updates.length > 0) {
    const updateChunks = chunk(attestations.updates, prismaBatchSize);

    for (const batchUpdates of updateChunks) {
      await pRetry(async () => {
        const updateQuery = Prisma.sql`
          UPDATE "Committee" c
          SET "attestationDelay" = v.delay
          FROM (VALUES
            ${Prisma.join(
              batchUpdates.map(
                (u) =>
                  Prisma.sql`(${u.slot}, ${u.index}, ${u.aggregationBitsIndex}, ${u.attestationDelay})`
              )
            )}
          ) AS v(slot, index, aggregationBitsIndex, delay)
          WHERE c.slot = v.slot 
            AND c.index = v.index 
            AND c."aggregationBitsIndex" = v.aggregationBitsIndex;
        `;

        await prisma.$executeRaw(updateQuery);
      }, retryOptions);
    }
  }

  // Process deletes
  if (attestations.deletes.length > 0) {
    const deleteChunks = chunk(attestations.deletes, prismaBatchSize);

    // Create temp table
    await pRetry(async () => {
      await prisma.$executeRaw(
        Prisma.sql`CREATE TABLE IF NOT EXISTS tmp_delete_committee(slot int, index int, aggregation_bits_index int);`
      );
    }, retryOptions);

    // Insert data in chunks
    for (const batchDeletes of deleteChunks) {
      await pRetry(async () => {
        const insertQuery = Prisma.sql`
            INSERT INTO tmp_delete_committee (slot, index, aggregation_bits_index)
            VALUES ${Prisma.join(
              batchDeletes.map(
                (d) =>
                  Prisma.sql`(${d.slot}, ${d.index}, ${d.aggregationBitsIndex})`
              )
            )};
          `;
        await prisma.$executeRaw(insertQuery);
      }, retryOptions);
    }

    // Delete matching records
    await pRetry(async () => {
      const deleteQuery = Prisma.sql`
          DELETE FROM "Committee" c
          USING tmp_delete_committee t
          WHERE c.slot = t.slot 
            AND c.index = t.index 
            AND c."aggregationBitsIndex" = t.aggregation_bits_index;
        `;
      await prisma.$executeRaw(deleteQuery);
    }, retryOptions);
  }

  // Update slot
  await pRetry(async () => {
    await prisma.slot.update({
      where: { slot: slotNumber },
      data: { attestationsFetched: true },
    });
  }, retryOptions);

  // Truncate temp table
  await pRetry(async () => {
    await prisma.$executeRaw(Prisma.sql`TRUNCATE TABLE tmp_delete_committee;`);
  }, retryOptions);
}
