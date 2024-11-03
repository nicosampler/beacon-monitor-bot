import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";

import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { getPrisma } from "@/src/lib/prisma.js";
import createLogger from "@/src/lib/pino.js";
import { getOldestLookbackSlot } from "@/src/beacon/utils/misc.js";
import { fetchCommittee } from "@/src/feed/fetchCommittee.js";

const ID = "FetchCommittee";
const prisma = getPrisma();

export const fetchNextCommittee = async () => {
  const now = new Date();
  const currentSlot = getSlotNumberFromTimestamp(now.getTime());
  const headSlot = currentSlot - 1;
  const oldestLookbackSlot = getOldestLookbackSlot();

  const lastProcessedSlot = await prisma.committee.findFirst({
    orderBy: { slot: "desc" },
  });

  const slotToFetch = lastProcessedSlot
    ? lastProcessedSlot.slot + 1
    : oldestLookbackSlot;

  const logger = createLogger(`${ID} for slot ${slotToFetch}`, true);

  if (Math.min(slotToFetch, headSlot) > headSlot) {
    logger.info(`head slot reached`);
    return;
  }

  return fetchCommittee(slotToFetch, logger);
};

export const job = new SimpleIntervalJob(
  { milliseconds: 250, runImmediately: true },
  new AsyncTask(`${ID}_task`, fetchNextCommittee),
  {
    id: ID,
    preventOverrun: true,
  }
);
