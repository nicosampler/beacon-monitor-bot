import { getAttestations } from "@/src/beacon/endpoints.js";
import {
  convertBitsToString,
  convertHexStringToByteArray,
} from "@/src/beacon/utils/bitlist.js";
import { pullCommittee } from "@/src/feed/committee.js";
import { db_getSlotByNumber } from "@/src/feed/utils.js";
import createLogger from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";

const prisma = getPrisma();

export const pullAttestations = async (slotNumber: number) => {
  const logger = createLogger(`pullAttestations for slot ${slotNumber}`);

  try {
    await pullCommittee(slotNumber);

    // Make sure the slot exists because we need to update it and check if the attestations have not been already fetched
    const slot = await db_getSlotByNumber(slotNumber);
    if (!slot) {
      throw new Error(`not found in DB.`);
    }
    if (slot.attestationsFetched) {
      logger.info(`already fetched.`);
      return;
    }

    // Fetch attestations for slot n that are available in slot
    let fetchedAttestations = await getAttestations(slot.slot + 1);

    if (fetchedAttestations === "SLOT MISSED") {
      prisma.slot.upsert({
        where: { slot: slot.slot },
        update: { attestationsFetched: true },
        create: { slot: slot.slot, attestationsFetched: true },
      });
      logger.info(`slot missed.`);
      return;
    }

    if (!fetchedAttestations.length) {
      logger.warn(`No attestations found.`);
      return;
    }

    // Execute all the updates
    await prisma.$transaction([
      // Upsert the slot to indicate that the attestations have been fetched
      prisma.slot.upsert({
        where: { slot: slot.slot },
        update: { attestationsFetched: true },
        create: { slot: slot.slot, attestationsFetched: true },
      }),

      // Upsert the attestations
      ...fetchedAttestations.map((attestation) =>
        prisma.attestations.create({
          // where: {
          //   slot_index: {
          //     slot: +attestation.data.slot,
          //     index: +attestation.data.index,
          //   },
          // },
          // update: {
          //   aggregationBits: convertBitsToString(
          //     convertHexStringToByteArray(attestation.aggregation_bits)
          //   ),
          // },
          data: {
            slot: +attestation.data.slot,
            index: +attestation.data.index,
            aggregationBits: convertBitsToString(
              convertHexStringToByteArray(attestation.aggregation_bits)
            ),
          },
        })
      ),
    ]);

    logger.info(`saved.`);
  } catch (error) {
    console.error(error);
    logger.error("There was an error.", { error });
    throw error;
  }
};
