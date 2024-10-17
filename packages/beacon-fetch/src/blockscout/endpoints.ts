import { instance } from "@/src/blockscout/utils/instance.js";
import { Blocks } from "@/src/blockscout/types.js";
import { env } from "@/src/env.js";

export async function getBlock(blockNumber: number): Promise<Blocks> {
  const results = await instance.get<Blocks>(
    `${env.BLOCKSCOUT_API_URL}/v2/blocks/${blockNumber}`
  );

  return results.data;
}
