import { instance } from "@/src/blockscout/utils/instance.js";
import { Blocks } from "@/src/blockscout/types.js";
import { env } from "@/src/env.js";
import pRetry from "p-retry";

export async function getBlock(blockNumber: number): Promise<Blocks> {
  // Retry up to 5 times with exponential backoff
  return pRetry(
    async () => {
      const results = await instance.get<Blocks>(
        `${env.BLOCKSCOUT_API_URL}/v2/blocks/${blockNumber}`
      );
      return results.data;
    },
    {
      retries: 5,
      minTimeout: 1000,
    }
  );
}
