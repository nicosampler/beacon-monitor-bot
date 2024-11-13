import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";

import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { fetchAttestation } from "@/src/feed/fetchAttestations.js";
import createLogger from "@/src/lib/pino.js";
import { getOldestLookbackSlot } from "@/src/beacon/utils/misc.js";

const ID = "FetchAttestation";
const prisma = getPrisma();

export const fetchOldestAttestation = async () => {
  const now = new Date();
  const currentSlot = getSlotNumberFromTimestamp(now.getTime());
  const headSlot = currentSlot - 1;
  const oldestLookbackSlot = getOldestLookbackSlot();

  try {
    // Get the last processed slot
    const lastProcessedSlot = await prisma.slot.findFirst({
      where: {
        attestationsFetched: true,
      },
      orderBy: { slot: "desc" },
      select: { slot: true },
    });

    const slotToFetch = lastProcessedSlot
      ? lastProcessedSlot.slot + 1
      : oldestLookbackSlot;

    const logger = createLogger(`${ID} for slot ${slotToFetch}`, false);

    if (Math.min(slotToFetch, headSlot) > headSlot) {
      logger.info(`No new slots to fetch. Current head: ${headSlot}`);
      return;
    }

    return fetchAttestation(slotToFetch, logger);
  } catch (error) {
    createLogger("fetchAttestationTask").error(
      `Error fetching oldest attestation: ${error}`,
      error
    );
  }
};

export const job = new SimpleIntervalJob(
  { seconds: 2.5, runImmediately: true },
  new AsyncTask(`${ID}_task`, () => {
    const logger = createLogger(ID);
    return fetchOldestAttestation().catch((e) => logger.error("TASK-CATCH", e));
  }),
  {
    id: ID,
    preventOverrun: true,
  }
);
