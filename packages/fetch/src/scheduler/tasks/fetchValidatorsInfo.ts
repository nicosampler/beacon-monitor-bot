import { fetchValidatorsInfo } from "@/src/feed/fetchValidatorsInfo.js";
import createLogger from "@/src/lib/pino.js";
import { scheduler } from "@/src/lib/scheduler.js";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";

export function scheduleFetchValidatorsInfo({
  logsEnabled,
  interval,
  ID,
}: {
  logsEnabled: boolean;
  interval: number;
  ID: string;
}) {
  scheduler.addSimpleIntervalJob(
    new SimpleIntervalJob(
      { milliseconds: interval, runImmediately: true },
      new AsyncTask(`${ID}_task`, () => {
        const logger = createLogger(ID, logsEnabled);
        return fetchValidatorsInfo(logger).catch((e) =>
          logger.error("TASK-CATCH", e)
        );
      }),
      {
        id: ID,
        preventOverrun: true,
      }
    )
  );
}
