import { SimpleIntervalJob, AsyncTask } from "toad-scheduler";
import createLogger from "@/src/lib/pino.js";
import { cleanupCommittee } from "@/src/feed/cleanupCommittee.js";

const ID = "cleanupCommittee";
const logger = createLogger(ID, true);

// TODO: Make it part of the summarizeHourly task
export const job = new SimpleIntervalJob(
  { hours: 1, runImmediately: true },
  new AsyncTask(`${ID}_task`, () =>
    cleanupCommittee(logger).catch((e) => logger.error("TASK-CATCH", e))
  ),
  {
    id: ID,
    preventOverrun: true,
  }
);
