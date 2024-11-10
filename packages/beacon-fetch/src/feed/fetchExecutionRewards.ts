import { getPrisma } from "@/src/lib/prisma.js";
import { CustomLogger } from "@/src/lib/pino.js";
import { env } from "@/src/env.js";
import { getBlock } from "@/src/blockscout/endpoints.js";
import { addSeconds, differenceInSeconds } from "date-fns";
import { Blocks } from "@/src/blockscout/types.js";
import { Decimal } from "@prisma/client/runtime/library";
import { getTimestampFromSlotNumber } from "@/src/beacon/utils/time.js";

const prisma = getPrisma();

export async function fetchExecutionRewards(logger: CustomLogger) {
  try {
    // Get the latest saved block
    const latestReward = await prisma.executionRewards.findFirst({
      orderBy: { timestamp: "desc" },
    });

    let blockToQuery: number;

    if (latestReward) {
      const now = new Date();
      const secondsSinceLastBlock = Math.abs(
        differenceInSeconds(now, latestReward.timestamp)
      );

      // If the time since the last block is less than a slot duration, abort
      if (secondsSinceLastBlock <= env.BEACON_SLOT_DURATION_IN_SECONDS * 2) {
        logger.info("Skipping, block is still in progress");
        return;
      }

      blockToQuery = latestReward.blockNumber + 1;
    } else {
      blockToQuery = env.EXECUTION_BLOCK_LOOKBACK;
    }

    const lastSlotWithAttestations = await prisma.slot.findFirst({
      where: { attestationsFetched: true },
      orderBy: { slot: "desc" },
    });

    const lastSlotWithAttestationsDate = new Date(
      getTimestampFromSlotNumber(lastSlotWithAttestations?.slot)
    );

    // only fetch if the last slot with attestations is near.
    if (
      latestReward &&
      latestReward.timestamp > lastSlotWithAttestationsDate &&
      differenceInSeconds(
        latestReward.timestamp,
        lastSlotWithAttestationsDate
      ) > 10
    ) {
      logger.info("Skipping, Slot attestation is too far in the past");
      return;
    }

    logger.info(`Fetching block: ${blockToQuery}`);
    let blockInfo: Blocks = undefined;

    try {
      blockInfo = await getBlock(blockToQuery);
    } catch (error: any) {
      if (
        error.response.status === 404 &&
        error.response.statusText === "Not Found"
      ) {
        logger.info(`Block ${blockToQuery} not found`);

        await prisma.executionRewards.create({
          data: {
            address: "",
            timestamp: addSeconds(
              latestReward.timestamp,
              env.BEACON_SLOT_DURATION_IN_SECONDS
            ),
            amount: new Decimal(0),
            blockNumber: blockToQuery,
          },
        });

        return;
      } else {
        logger.error(`Error fetching block ${blockToQuery}: ${error}`, {
          message: error.message,
        });
        return;
      }
    }

    const minerReward = blockInfo.rewards.find(
      (r) => r.type === "Miner Reward"
    );
    await prisma.executionRewards.create({
      data: {
        address: blockInfo.miner.hash,
        timestamp: new Date(blockInfo.timestamp),
        amount: minerReward ? new Decimal(minerReward.reward) : new Decimal(0),
        blockNumber: blockInfo.height,
      },
    });
  } catch (error) {
    logger.error(`Error saving execution rewards: ${error}`, error);
  }
}
