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

    const fetchedAttestations = await getAttestation(slotNumber, logger);
    if (!fetchedAttestations) return;

    const filteredAttestations = fetchedAttestations.filter(
      (attestation) => +attestation.data.slot >= getOldestLookbackSlot()
    );

    // Process all attestations and calculate the attestation delay
    const allProcessedAttestations: CommitteeUpdate[] = [];
    for (const attestation of filteredAttestations) {
      const processedAttestations = await processAttestation(
        slotNumber,
        attestation,
        logger
      );
      allProcessedAttestations.push(...processedAttestations);
    }

    // Update the validators with the attestation delay in the database
    await updateValidatorsAttestations(
      allProcessedAttestations,
      slotNumber,
      logger
    );

    logger.info(`Done for slot ${slotNumber}.`);
  } catch (error) {
    logger.error("There was an error.", { error });
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

  if (!fetchedAttestations.length) {
    logger.warn(`No attestations found.`);
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
  validatorIndex: number;
  aggregationBitsIndex: number;
  attestationDelay: number;
}

/**
 * Process an attestation.
 * @param slotNumber - The slot number to process the attestation for.
 * @param attestation - The attestation to process.
 * @param logger - The logger to use.
 * @returns Returns the validators that attested and the attestation delay.
 */
async function processAttestation(
  slotNumber: number,
  attestation: Attestation,
  logger: CustomLogger
): Promise<CommitteeUpdate[]> {
  const aggregationBits = convertBitsToString(
    convertHexStringToByteArray(attestation.aggregation_bits)
  );

  // Retrieve validators indices from the committee to be able to check if they attested
  // indices are the same as the position in the aggregation bits.
  const validators = await prisma.committee.findMany({
    where: {
      AND: [
        { slot: +attestation.data.slot },
        { index: +attestation.data.index },
      ],
    },
    select: {
      validatorIndex: true,
      aggregationBitsIndex: true,
    },
    orderBy: {
      aggregationBitsIndex: "asc",
    },
  });

  const updates: CommitteeUpdate[] = [];

  for (const validator of validators) {
    const didAttest = aggregationBits[validator.aggregationBitsIndex] === "1";
    if (didAttest) {
      updates.push({
        slot: +attestation.data.slot,
        index: +attestation.data.index,
        validatorIndex: validator.validatorIndex,
        aggregationBitsIndex: validator.aggregationBitsIndex,
        attestationDelay: slotNumber - Number(attestation.data.slot),
      });
    }
  }

  return updates;
}

/**
 * After processing the attestations for a slot, update the validators within the Committee table.
 * Validators that attested early (within BEACON_MAX_ATTESTATION_DELAY slots) are deleted, for performance reasons.
 * The others are updated with the attestation delay.
 * @param allProcessedAttestations - The attestations to update.
 * @param slotNumber - The slot number to update the attestations for.
 * @param logger - The logger to use.
 */
async function updateValidatorsAttestations(
  allProcessedAttestations: CommitteeUpdate[],
  slotNumber: number,
  logger: CustomLogger
): Promise<void> {
  const prismaBatchSize = 4000;

  logger.info(`Saving ${allProcessedAttestations.length} attestations.`);

  await prisma.$transaction(
    async (tx) => {
      if (allProcessedAttestations.length > 0) {
        // Group updates by slot and index to reduce the number of WHERE clauses
        const updateChunks = chunk(allProcessedAttestations, prismaBatchSize);

        for (const batchUpdates of updateChunks) {
          // Create a more efficient update query using VALUES list
          const updateQuery = Prisma.sql`
            UPDATE "Committee" c
            SET "attestationDelay" = v.delay
            FROM (VALUES
              ${Prisma.join(
                batchUpdates.map(
                  (u) =>
                    Prisma.sql`(${u.slot}, ${u.index}, ${u.validatorIndex}, ${u.attestationDelay})`
                )
              )}
            ) AS v(slot, index, validator_index, delay)
            WHERE c.slot = v.slot 
              AND c.index = v.index 
              AND c."validatorIndex" = v.validator_index;
          `;

          await tx.$executeRaw(updateQuery);
        }
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

  logger.info(`Saved.`);
}
