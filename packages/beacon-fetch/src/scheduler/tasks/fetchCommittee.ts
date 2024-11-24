import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import { fetchNextCommittees } from "@/src/feed/fetchCommittee.js";
import createLogger from "@/src/lib/pino.js";

const ID = "FetchCommittee";

export const job = new SimpleIntervalJob(
  { seconds: 2, runImmediately: true },
  new AsyncTask(`${ID}_task`, () => {
    const logger = createLogger(ID);
    return fetchNextCommittees().catch((e) => logger.error("TASK-CATCH", e));
  }),
  {
    id: ID,
    preventOverrun: true,
  }
);
