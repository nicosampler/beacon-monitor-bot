import { getPrisma } from "@/src/lib/prisma.js";
import createLogger from "@/src/lib/pino.js";
import { env } from "@/src/env.js";
import { getBlock } from "@/src/blockscout/endpoints.js";
import { differenceInSeconds } from "date-fns";
import { Blocks } from "@/src/blockscout/types.js";

const logger = createLogger("FetchExecutionRewards");
const prisma = getPrisma();

export async function fetchExecutionRewards() {
  // Get the latest saved block
  const latestReward = await prisma.executionRewards.findFirst({
    orderBy: { timestamp: "desc" },
  });

  let blockToQuery: number;

  if (latestReward) {
    const now = new Date();
    const secondsSinceLastBlock = differenceInSeconds(
      now,
      latestReward.timestamp
    );

    // If the time since the last block is less than a slot duration, abort
    if (secondsSinceLastBlock < env.BEACON_SLOT_DURATION_IN_SECONDS) {
      logger.info("Skipping, block is still in progress");
      return;
    }

    blockToQuery = latestReward.blockNumber + 1;
  } else {
    blockToQuery = env.EXECUTION_BLOCK_LOOKBACK;
  }

  logger.info(`Fetching block: ${blockToQuery}`);
  let blockInfo: Blocks = undefined;

  try {
    blockInfo = await getBlock(blockToQuery);
  } catch (error) {
    logger.error(`Error fetching block ${blockToQuery}: ${error}`);
    return;
  }

  const minerReward = blockInfo.rewards.find((r) => r.type === "Miner Reward");
  await prisma.executionRewards.create({
    data: {
      address: blockInfo.miner.hash,
      timestamp: new Date(blockInfo.timestamp),
      amount: minerReward ? BigInt(minerReward.reward) : 0,
      blockNumber: blockInfo.height,
    },
  });

  logger.info(`done.`);
}
