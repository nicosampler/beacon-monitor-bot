import { getAttestations } from "@/src/beacon/endpoints.js";
import {
  convertBitsToString,
  convertHexStringToByteArray,
} from "@/src/beacon/utils/bitlist.js";
import { pullCommittee } from "@/src/feed/pullCommittee.js";
import { db_getSlotByNumber } from "@/src/feed/utils.js";
import createLogger, { CustomLogger } from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { Slot } from "@prisma/client";
import { getOldestLookbackSlot } from "@/src/beacon/utils/misc.js";
import { Prisma } from "@prisma/client";
import { env } from "@/src/env.js";

const prisma = getPrisma();

export const pullAttestations = async (slotNumber: number) => {
  const logger = createLogger(`pullAttestations for slot ${slotNumber}`);

  try {
    await pullCommittee(slotNumber);

    // Check if the slot is already processed
    const slot = await checkSlotValidation(slotNumber, logger);
    if (!slot) return;

    const fetchedAttestations = await fetchAttestations(slotNumber + 1, logger);
    if (!fetchedAttestations) return;
    const filteredAttestations = fetchedAttestations.filter(
      (attestation) => +attestation.data.slot >= getOldestLookbackSlot()
    );

    // Process all attestations
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

    logger.info(`done.`);
  } catch (error) {
    logger.error("There was an error.", { error });
    throw error;
  }
};

async function checkSlotValidation(
  slotNumber: number,
  logger: CustomLogger
): Promise<Slot | null> {
  const slot = await db_getSlotByNumber(slotNumber);
  if (!slot) {
    logger.error(`Slot not found in DB.`);
    throw new Error(`Slot not found in DB.`);
  }
  if (slot.attestationsFetched) {
    logger.info(`Attestations already fetched.`);
    return null;
  }
  return slot;
}

async function fetchAttestations(slot: number, logger: CustomLogger) {
  let fetchedAttestations = await getAttestations(slot);

  if (fetchedAttestations === "SLOT MISSED") {
    await prisma.slot.update({
      where: { slot },
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
  Awaited<ReturnType<typeof fetchAttestations>>
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
      slot: +attestation.data.slot,
      index: +attestation.data.index,
    },
    orderBy: {
      aggregationBitsIndex: "asc",
    },
    select: {
      validatorIndex: true,
      aggregationBitsIndex: true,
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
 * Validators that attested early (within 5 slots) are deleted, for performance reasons.
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
  await prisma.$transaction(
    async (tx) => {
      logger.info(
        `Processing ${allProcessedAttestations.length} attestations.`
      );

      if (allProcessedAttestations.length > 0) {
        const batchSize = 4000;
        const validatorsToDelete = allProcessedAttestations.filter(
          (a) => a.attestationDelay <= 5
        );
        const validatorsToUpdate = allProcessedAttestations.filter(
          (a) => a.attestationDelay > 5
        );

        // Delete attestations with delay <= 5
        for (let i = 0; i < validatorsToDelete.length; i += batchSize) {
          const batchDeletes = validatorsToDelete.slice(i, i + batchSize);
          const deleteQuery = Prisma.sql`
            DELETE FROM "Committee"
            WHERE ("slot", "index", "validatorIndex") IN (
              ${Prisma.join(
                batchDeletes.map(
                  (u) =>
                    Prisma.sql`(${u.slot}, ${u.index}, ${u.validatorIndex})`
                )
              )}
            );
          `;

          await prisma.$executeRaw(deleteQuery);
        }

        // Update attestations with delay > 5
        for (let i = 0; i < validatorsToUpdate.length; i += batchSize) {
          const batchUpdates = validatorsToUpdate.slice(i, i + batchSize);
          const updateQuery = Prisma.sql`
            UPDATE "Committee"
            SET "attestationDelay" = CASE
              ${Prisma.join(
                batchUpdates.map(
                  (u) =>
                    Prisma.sql`WHEN "slot" = ${u.slot} AND "index" = ${u.index} AND "validatorIndex" = ${u.validatorIndex} THEN ${u.attestationDelay}`
                ),
                " "
              )}
            END
            WHERE ("slot", "index", "validatorIndex") IN (
              ${Prisma.join(
                batchUpdates.map(
                  (u) =>
                    Prisma.sql`(${u.slot}, ${u.index}, ${u.validatorIndex})`
                )
              )}
            );
          `;

          await prisma.$executeRaw(updateQuery);
        }
      }

      await prisma.slot.update({
        where: { slot: slotNumber },
        data: { attestationsFetched: true },
      });
    },
    {
      timeout: 40_000,
    }
  );
}
