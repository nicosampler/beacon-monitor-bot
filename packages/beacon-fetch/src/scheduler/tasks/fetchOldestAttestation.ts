import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";

import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { fetchAttestation } from "@/src/feed/fetchAttestations.js";
import createLogger from "@/src/lib/pino.js";
import { getOldestLookbackSlot } from "@/src/beacon/utils/misc.js";

const logger = createLogger(null);
const prisma = getPrisma();

export const fetchOldestAttestation = async () => {
  const now = new Date();
  const currentSlot = getSlotNumberFromTimestamp(now.getTime());
  const headSlot = currentSlot - 1;
  const oldestLookbackSlot = getOldestLookbackSlot();

  // Get the last processed slot
  const lastProcessedSlot = await prisma.slot.findFirst({
    where: {
      attestationsFetched: true,
    },
    orderBy: { slot: "desc" },
    select: { slot: true },
  });

  let slotToFetch;

  if (lastProcessedSlot) {
    // If we have a last processed slot, fetch the next one
    slotToFetch = lastProcessedSlot.slot + 1;
  } else {
    // If no processed slots found, start from the oldestLookbackSlot
    slotToFetch = oldestLookbackSlot;
    logger.info(
      `No processed slots found. Starting from oldestLookbackSlot: ${oldestLookbackSlot}`
    );
  }

  // Ensure we don't fetch beyond the current head
  slotToFetch = Math.min(slotToFetch, headSlot);

  if (slotToFetch > headSlot) {
    logger.info(`No new slots to fetch. Current head: ${headSlot}`);
    return;
  }

  logger.info(
    `Pulling attestations for slot ${slotToFetch}. HeadSlot: ${headSlot}.`
  );

  return fetchAttestation(slotToFetch);
};

const ID = "fetchOldestAttestation";

export const job = new SimpleIntervalJob(
  { seconds: 1, runImmediately: true },
  new AsyncTask(`${ID}_task`, fetchOldestAttestation),
  {
    id: ID,
    preventOverrun: true,
  }
);
