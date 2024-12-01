import { getPrisma } from "@/src/lib/prisma.js";
import { CustomLogger } from "@/src/lib/pino.js";
import { env } from "@/src/env.js";
import { getBlock } from "@/src/execution/endpoints.js";
import { addSeconds } from "date-fns";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = getPrisma();

export async function fetchExecutionRewards(
  logger: CustomLogger,
  blockToQuery: number,
  latestRewardTimestamp: Date
) {
  try {
    const blockInfo = await getBlock(blockToQuery);
    await prisma.executionRewards.create({
      data: blockInfo,
    });
  } catch (error: any) {
    logger.warn("Not found");
    await prisma.executionRewards.create({
      data: {
        address: "",
        timestamp: addSeconds(
          latestRewardTimestamp,
          env.BEACON_SLOT_DURATION_IN_SECONDS
        ),
        amount: new Decimal(0),
        blockNumber: blockToQuery,
      },
    });
  }
}
