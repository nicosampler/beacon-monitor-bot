import { fetchValidatorsInfo } from "@/src/feed/fetchValidatorsInfo.js";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";

const ID = "fetchValidatorsWithoutWithdrawalAddress";

export const job = new SimpleIntervalJob(
  { minutes: 60, runImmediately: true },
  new AsyncTask(`${ID}_task`, fetchValidatorsInfo),
  {
    id: ID,
    preventOverrun: true,
  }
);
