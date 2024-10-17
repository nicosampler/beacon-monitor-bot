import { fetchValidatorsBalances } from "@/src/feed/fetchValidatorsBalances.js";
import createLogger from "@/src/lib/pino.js";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";

const logger = createLogger("validatorsBalancesJob");

const ID = "fetchValidatorsBalances";

export const job = new SimpleIntervalJob(
  { minutes: 5, runImmediately: true },
  new AsyncTask(`${ID}_task`, fetchValidatorsBalances),
  {
    id: ID,
    preventOverrun: true,
  }
);
