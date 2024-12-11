import { SimpleIntervalJob, AsyncTask } from "toad-scheduler";
import { fetchExecutionRewards } from "@/src/feed/fetchExecutionRewards.js";
import createLogger from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { differenceInSeconds } from "date-fns";
import { env } from "@/src/env.js";
import { scheduler } from "@/src/lib/scheduler.js";

const prisma = getPrisma();

const _fetchExecutionRewardsTask = async (ID: string, logsEnabled: boolean) => {
  const latestReward = await prisma.executionRewards.findFirst({
    orderBy: { timestamp: "desc" },
  });

  let blockToQuery: number;

  if (latestReward) {
    const now = new Date();
    const secondsSinceLastBlock = Math.abs(
      differenceInSeconds(now, latestReward.timestamp)
    );

    // If the time since the last block is less than a slot duration * 5, abort
    if (
      secondsSinceLastBlock <
      env.BEACON_SLOT_DURATION_IN_SECONDS * env.BEACON_DELAY_SLOTS_TO_HEAD
    ) {
      const logger = createLogger(
        `${ID} ${latestReward.blockNumber + 1}`,
        true
      );
      logger.info(`Skipping, too close to the head.`);
      return;
    }

    blockToQuery = latestReward.blockNumber + 1;
  } else {
    blockToQuery = env.EXECUTION_BLOCK_LOOKBACK;
  }

  const logger = createLogger(`${ID} ${blockToQuery}`, logsEnabled);

  await fetchExecutionRewards(logger, blockToQuery, latestReward?.timestamp);
};

export function scheduleFetchExecutionRewards({
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
        return _fetchExecutionRewardsTask(ID, logsEnabled).catch((e) =>
          logger.error("TASK-CATCH", e.message)
        );
      }),
      {
        id: ID,
        preventOverrun: true,
      }
    )
  );
}
