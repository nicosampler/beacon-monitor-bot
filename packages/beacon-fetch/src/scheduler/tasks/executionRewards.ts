import { SimpleIntervalJob, AsyncTask } from "toad-scheduler";
import { fetchExecutionRewards } from "@/src/feed/fetchExecutionRewards.js";
import createLogger from "@/src/lib/pino.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { differenceInSeconds } from "date-fns";
import { env } from "@/src/env.js";

const ID = "fetchExecutionRewards";
const prisma = getPrisma();

const fetchExecutionRewardsTask = async () => {
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

  const logger = createLogger(`${ID} ${blockToQuery}`, false);

  return fetchExecutionRewards(
    logger,
    blockToQuery,
    latestReward?.timestamp
  ).catch((e) => logger.error("TASK-CATCH", e.message));
};

export const job = new SimpleIntervalJob(
  { seconds: 1, runImmediately: true },
  new AsyncTask(`${ID}_task`, () => fetchExecutionRewardsTask()),
  {
    id: ID,
    preventOverrun: true,
  }
);
