import { getCommittees } from "@/src/beacon/endpoints.js";
import { db_existCommitteeForSlot } from "@/src/feed/utils.js";
import _ from "lodash";

import { getPrisma } from "@/src/lib/prisma.js";
import createLogger from "@/src/lib/pino.js";

const prisma = getPrisma();

/**
 * Pull the committee for a given slot
 * This function can be used te fetch the current committee or the committee for a given slot
 * It might bring committees that are already in the db, we need to filter them out
 * */
export const pullCommittee = async (
  stateId: number | "head"
): Promise<void> => {
  const logger = createLogger(`pullCommittee slot ${stateId}`);
  logger.info("");

  try {
    if (stateId !== "head") {
      const existCommittee = await db_existCommitteeForSlot(stateId);
      if (existCommittee) {
        logger.info(`already fetched.`);
        return Promise.resolve();
      }
    }

    // getCommittees returns the committees for more than one slot.
    const fetchedCommittees = await getCommittees(stateId);

    // Get unique slots from the committees
    const uniqueSlotsInCommittees = Array.from(
      new Set(fetchedCommittees.map((c) => +c.slot))
    );

    // Prepare slots upserts
    const slotUpserts = uniqueSlotsInCommittees.map((slot) =>
      prisma.slot.upsert({
        where: { slot },
        update: {}, // No update needed if it exists
        create: { slot, attestationsFetched: false },
      })
    );

    // Prepare committee upserts
    const committeeUpserts = fetchedCommittees.map((committee) =>
      prisma.committee.upsert({
        where: {
          slot_index: {
            slot: +committee.slot,
            index: +committee.index,
          },
        },
        update: {
          validators: committee.validators,
        },
        create: {
          slot: +committee.slot,
          index: +committee.index,
          validators: committee.validators,
        },
      })
    );

    if (!slotUpserts.length && !committeeUpserts.length) {
      logger.info(`nothing to save.`);
      return;
    }

    // Logging new committees
    const groupedCommittees = fetchedCommittees.reduce(
      (acc, committee) => {
        if (!acc[committee.slot]) {
          acc[committee.slot] = [];
        }
        acc[committee.slot].push(+committee.index);
        return acc;
      },
      {} as Record<string, number[]>
    );

    const logMessage = Object.entries(groupedCommittees)
      .map(([slot, indexes]) => `  ${slot}:${indexes.length}`)
      .join("\n");

    logger.info(`
Slots to upsert: ${slotUpserts.length}
Committees to upsert:
${logMessage}
`);

    // Execute all the updates
    await prisma.$transaction([...slotUpserts, ...committeeUpserts]);

    logger.info(`saved.`);
  } catch (error) {
    logger.error(`pullCommittee: for slot ${stateId}`, { error });
    throw error;
  }
};
