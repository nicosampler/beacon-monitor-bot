import ms from "ms";
import chunk from "lodash/chunk.js";

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
  slotNumber: number,
  logger: CustomLogger
) => {
  try {
    const existCommittee = await db_existCommitteeForSlot(slotNumber);
    if (!existCommittee) {
      logger.info(`Skipping, no committee found for slot ${slotNumber}.`);
      return;
    }

    logger.info(`start.`);

    const fetchedAttestations = await getAttestation(slotNumber, logger);
    if (!fetchedAttestations) return;
    // Filter out attestations that are older than the oldest lookback slot
    const filteredAttestations = fetchedAttestations.filter(
      (attestation) => +attestation.data.slot >= getOldestLookbackSlot()
    );

    // Process all attestations with the pre-fetched validators
    const allProcessedAttestations: CommitteeUpdate[] = [];
    const allDeleteAttestations: CommitteeUpdate[] = [];
    for (const attestation of filteredAttestations) {
      const processedAttestations = processAttestation(slotNumber, attestation);
      allProcessedAttestations.push(...processedAttestations.updates);
      allDeleteAttestations.push(...processedAttestations.deletes);
    }

    // Update the validators with the attestation delay in the database
    await updateAndDeleteValidatorAttestations(
      {
        updates: allProcessedAttestations,
        deletes: allDeleteAttestations,
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
  let fetchedAttestations = await getAttestations(slot + 1);

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

/**
 * Process an attestation with pre-fetched validators
 */
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
 * Validators that attested early (within BEACON_MAX_ATTESTATION_DELAY slots) are deleted, for performance reasons.
 * The others are updated with the attestation delay.
 * @param attestations - The attestations to update.
 * @param slotNumber - The slot number to update the attestations for.
 * @param logger - The logger to use.
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

  await prisma.$transaction(
    async (tx) => {
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
                    Prisma.sql`(${u.slot}, ${u.index}, ${u.aggregationBitsIndex}, ${u.attestationDelay})`
                )
              )}
            ) AS v(slot, index, aggregationBitsIndex, delay)
            WHERE c.slot = v.slot 
              AND c.index = v.index 
              AND c."aggregationBitsIndex" = v.aggregationBitsIndex;
          `;

          await tx.$executeRaw(updateQuery);
        }
      }

      // Process deletes
      if (attestations.deletes.length > 0) {
        const deleteChunks = chunk(attestations.deletes, prismaBatchSize);

        // Create temp table
        const createTempTableQuery = Prisma.sql`
          CREATE TEMP TABLE tmp_delete_committee(slot int, index int, aggregation_bits_index int);
        `;
        await tx.$executeRaw(createTempTableQuery);

        // Insert data in chunks
        for (const batchDeletes of deleteChunks) {
          const insertQuery = Prisma.sql`
            INSERT INTO tmp_delete_committee (slot, index, aggregation_bits_index)
            VALUES ${Prisma.join(
              batchDeletes.map(
                (d) =>
                  Prisma.sql`(${d.slot}, ${d.index}, ${d.aggregationBitsIndex})`
              )
            )};
          `;
          await tx.$executeRaw(insertQuery);
        }

        // Delete matching records
        const deleteQuery = Prisma.sql`
          DELETE FROM "Committee" c
          USING tmp_delete_committee t
          WHERE c.slot = t.slot 
            AND c.index = t.index 
            AND c."aggregationBitsIndex" = t.aggregation_bits_index;
        `;
        await tx.$executeRaw(deleteQuery);

        // Drop temp table
        const dropTableQuery = Prisma.sql`
          DROP TABLE tmp_delete_committee;
        `;
        await tx.$executeRaw(dropTableQuery);
      }

      await tx.slot.update({
        where: { slot: slotNumber },
        data: { attestationsFetched: true },
      });
    },
    {
      timeout: ms("3m"),
    }
  );
}
