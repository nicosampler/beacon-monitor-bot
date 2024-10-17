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

  // Check if the database is empty
  const isDbEmpty = (await prisma.slot.count()) === 0;

  let slotToFetch;

  if (isDbEmpty) {
    // If the database is empty, start from the oldestLookbackSlot
    slotToFetch = oldestLookbackSlot;
    logger.info(
      `Database is empty. Starting from oldestLookbackSlot: ${oldestLookbackSlot}`
    );
  } else {
    // Get the last processed slot
    const lastProcessedSlot = await prisma.slot.findFirst({
      where: {
        attestationsFetched: true,
      },
      orderBy: { slot: "desc" },
      select: { slot: true },
    });

    // If we have a last processed slot, fetch the next one
    slotToFetch = lastProcessedSlot
      ? lastProcessedSlot.slot + 1
      : oldestLookbackSlot;
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
