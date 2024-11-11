import { fetchValidatorsInfo } from "@/src/feed/fetchValidatorsInfo.js";
import createLogger from "@/src/lib/pino.js";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";

const ID = "fetchValidatorsInfo";
const logger = createLogger(ID, false);

export const job = new SimpleIntervalJob(
  { hours: 1, runImmediately: true },
  new AsyncTask(`${ID}_task`, () => fetchValidatorsInfo(logger)),
  {
    id: ID,
    preventOverrun: true,
  }
);
