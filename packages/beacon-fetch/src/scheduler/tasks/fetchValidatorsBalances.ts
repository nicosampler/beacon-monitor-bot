import { fetchValidatorsBalances } from "@/src/feed/fetchValidatorsBalances.js";
import createLogger from "@/src/lib/pino.js";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";

const ID = "fetchValidatorsBalances";
const logger = createLogger(ID, false);

export const job = new SimpleIntervalJob(
  { minutes: 10, runImmediately: false },
  new AsyncTask(`${ID}_task`, () =>
    fetchValidatorsBalances(logger).catch((e) =>
      logger.error("TASK-CATCH", e.message)
    )
  ),
  {
    id: ID,
    preventOverrun: true,
  }
);
