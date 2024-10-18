import { fetchValidatorsBalances } from "@/src/feed/fetchValidatorsBalances.js";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";

const ID = "fetchValidatorsBalances";

export const job = new SimpleIntervalJob(
  { minutes: 5, runImmediately: true },
  new AsyncTask(`${ID}_task`, fetchValidatorsBalances),
  {
    id: ID,
    preventOverrun: true,
  }
);
