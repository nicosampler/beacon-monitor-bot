import { getCommittees } from "@/src/beacon/endpoints.js";
import { db_existCommitteeForSlot } from "@/src/feed/utils.js";
import _ from "lodash";

import { getPrisma } from "@/src/lib/prisma.js";
import createLogger from "@/src/lib/pino.js";
import { CustomLogger } from "@/src/lib/pino.js";

const prisma = getPrisma();

// Updated function to log committee information
function logCommitteeInfo(
  logger: CustomLogger,
  fetchedCommittees: Array<{
    slot: string;
    index: string;
    validators: string[];
  }>,
  slotUpserts: Array<{ slot: number }>
): void {
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
    .map(([slot, indexes]) => `${slot}:${indexes.length}`)
    .join(",");

  logger.info(`New slots (${slotUpserts.length}) - Committees: ${logMessage}`);
}

/**
 * Pull the committee for a given slot
 * This function can be used te fetch the current committee or the committee for a given slot
 * It might bring committees that are already in the db, we need to filter them out
 * */
export const fetchCommittee = async (
  stateId: number | "head"
): Promise<void> => {
  const logger = createLogger(`pullCommittee slot ${stateId}`);

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

    // Prepare slots upsert
    const slotUpserts = uniqueSlotsInCommittees.map((slot) => ({
      slot,
      attestationsFetched: false,
    }));

    // Updated committee upsert
    const committeeUpserts = fetchedCommittees.flatMap((committee) =>
      committee.validators.map((validatorIndex, index) => ({
        slot: +committee.slot,
        index: +committee.index,
        aggregationBitsIndex: index,
        validatorIndex: +validatorIndex,
      }))
    );

    if (!slotUpserts.length && !committeeUpserts.length) {
      logger.info(`nothing to save.`);
      return;
    }

    logCommitteeInfo(logger, fetchedCommittees, slotUpserts);

    logger.info(`creating ${uniqueSlotsInCommittees} slots.`);
    const slotPromises = uniqueSlotsInCommittees.map((slot) =>
      prisma.slot.upsert({
        where: { slot },
        update: {}, // No update needed if it exists
        create: { slot, attestationsFetched: false },
      })
    );
    await Promise.all(slotPromises);
    logger.info(`slots created.`);

    const batchSize = 5000;
    logger.info(`creating ${committeeUpserts.length} committees`);
    for (let i = 0; i < committeeUpserts.length; i += batchSize) {
      const batch = committeeUpserts.slice(i, i + batchSize);
      await prisma.committee.createMany({
        data: batch,
        skipDuplicates: true,
      });
    }
  } catch (error) {
    logger.error(`pullCommittee: for slot ${stateId}`, { error });
    throw error;
  }
};
