import { SimpleIntervalJob, AsyncTask } from "toad-scheduler";
import { fetchExecutionRewards } from "@/src/feed/fetchExecutionRewards.js";
import createLogger from "@/src/lib/pino.js";

const ID = "fetchExecutionRewards";
const logger = createLogger(ID, false);

export const job = new SimpleIntervalJob(
  { seconds: 1, runImmediately: true },
  new AsyncTask(`${ID}_task`, () =>
    fetchExecutionRewards(logger).catch((e) =>
      logger.error("TASK-CATCH", e.message)
    )
  ),
  {
    id: ID,
    preventOverrun: true,
  }
);
