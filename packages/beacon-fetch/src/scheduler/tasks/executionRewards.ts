import { SimpleIntervalJob, AsyncTask } from "toad-scheduler";
import { fetchExecutionRewards } from "@/src/feed/fetchExecutionRewards.js";

const ID = "executionRewards";

export const job = new SimpleIntervalJob(
  { milliseconds: 500, runImmediately: true },
  new AsyncTask(`${ID}_task`, fetchExecutionRewards),
  {
    id: ID,
    preventOverrun: true,
  }
);
