import { SimpleIntervalJob, AsyncTask } from "toad-scheduler";
import { fetchExecutionRewards } from "@/src/feed/fetchExecutionRewards.js";
import createLogger from "@/src/lib/pino.js";

const ID = "executionRewards";
const logger = createLogger(ID, true);

export const job = new SimpleIntervalJob(
  { milliseconds: 500, runImmediately: true },
  new AsyncTask(`${ID}_task`, () => fetchExecutionRewards(logger)),
  {
    id: ID,
    preventOverrun: true,
  }
);
