import { SimpleIntervalJob, AsyncTask } from "toad-scheduler";
import createLogger from "@/src/lib/pino.js";
import { maintainCommittee } from "@/src/feed/maintainCommittee.js";

const ID = "maintainCommittee";
const logger = createLogger(ID, false);

export const job = new SimpleIntervalJob(
  { hours: 1, runImmediately: false },
  new AsyncTask(`${ID}_task`, () => maintainCommittee(logger)),
  {
    id: ID,
    preventOverrun: true,
  }
);
