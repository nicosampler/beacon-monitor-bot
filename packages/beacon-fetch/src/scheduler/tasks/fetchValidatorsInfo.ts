import { fetchValidatorsInfo } from "@/src/feed/fetchValidatorsInfo.js";
import createLogger from "@/src/lib/pino.js";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";

const ID = "fetchValidatorsWithoutWithdrawalAddress";
const logger = createLogger(ID);

export const job = new SimpleIntervalJob(
  { minutes: 60, runImmediately: true },
  new AsyncTask(`${ID}_task`, () => fetchValidatorsInfo(logger)),
  {
    id: ID,
    preventOverrun: true,
  }
);
