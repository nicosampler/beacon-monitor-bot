import { getCommittees } from "@/src/beacon/endpoints.js";
import {
  db_existCommitteeForSlot,
  db_getExistingCommittees,
  db_getSlotByNumbers,
} from "@/src/feed/utils.js";
import _ from "lodash";

import { getPrisma } from "@/src/lib/prisma.js";
import { Committee, Slot } from "@prisma/client";
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

    // get unique slots from the committees
    const uniqueSlotsInCommittees = Array.from(
      new Set(fetchedCommittees.map((c) => +c.slot))
    );

    // prepare to save slots that are not already in the db
    const existingSlots = await db_getSlotByNumbers(uniqueSlotsInCommittees);
    const slotsToAdd = _.difference(uniqueSlotsInCommittees, existingSlots);
    const newSlots: Pick<Slot, "slot" | "attestationsFetched">[] = [];
    slotsToAdd.forEach((slot) => {
      newSlots.push({
        slot,
        attestationsFetched: false,
      });
    });

    // prepare to save committees that are not already in the db
    // const existingSlotsInCommittees = await db_getUniqueSlotsFromCommittees(
    //   uniqueSlotsInCommittees
    // );
    const existingCommittees = await db_getExistingCommittees(
      fetchedCommittees.map((c) => ({
        slot: +c.slot,
        index: +c.index,
      }))
    );
    const missingCommittees = fetchedCommittees.filter(
      (fetchedCommittee) =>
        !existingCommittees.find(
          (existingCommittee) =>
            +fetchedCommittee.slot === existingCommittee.slot &&
            +fetchedCommittee.index === existingCommittee.index
        )
    );
    const newCommittees: Pick<Committee, "slot" | "index" | "validators">[] =
      [];
    missingCommittees.map((slotCommittee) => {
      newCommittees.push({
        slot: +slotCommittee.slot,
        index: +slotCommittee.index,
        validators: slotCommittee.validators,
      });
    });

    if (!newSlots.length && !newCommittees.length) {
      logger.info(`nothing to save.`);
      return Promise.resolve();
    }

    // Logging new committees
    const groupedCommittees = missingCommittees.reduce(
      (acc, committee) => {
        if (!acc[committee.slot]) {
          acc[committee.slot] = [];
        }
        acc[committee.slot].push(committee.index);
        return acc;
      },
      {} as Record<string, string[]>
    );

    const logMessage = Object.entries(groupedCommittees)
      .map(([slot, indexes]) => `  ${slot}:${indexes.length}`)
      .join("\n");

    logger.info(`
New Slots (${newSlots.length}).
New Committees (${Object.keys(groupedCommittees).length} slots):
${logMessage}
`);

    // save the new slots and committees
    await prisma.$transaction([
      prisma.slot.createMany({ data: newSlots }),
      prisma.committee.createMany({ data: newCommittees }),
    ]);

    logger.info(`saved.`);
  } catch (error) {
    console.error(error);
    logger.error(`pullCommittee: for slot ${stateId}`, { error });
    throw error;
  }
};
