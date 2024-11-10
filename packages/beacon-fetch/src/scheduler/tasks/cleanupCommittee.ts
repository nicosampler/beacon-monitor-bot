import { SimpleIntervalJob, AsyncTask } from "toad-scheduler";
import createLogger from "@/src/lib/pino.js";
import { cleanupCommittee } from "@/src/feed/cleanupCommittee.js";

const ID = "cleanupCommittee";
const logger = createLogger(ID, false);

// TODO: Make it part of the summarizeHourly task
export const job = new SimpleIntervalJob(
  { minutes: 10, runImmediately: true },
  new AsyncTask(`${ID}_task`, () => cleanupCommittee(logger)),
  {
    id: ID,
    preventOverrun: true,
  }
);
