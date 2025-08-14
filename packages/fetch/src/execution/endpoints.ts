import { Decimal } from '@prisma/client/runtime/library';
import { AxiosResponse } from 'axios';
import ms from 'ms';

import { env } from '@/src/env.js';
import { Blockscout_Blocks, Etherscan_BlockReward } from '@/src/execution/types.js';
import { instance } from '@/src/execution/utils/instance.js';
import { CustomLogger } from '@/src/lib/pino.js';

export type BlockResponse = {
  address: string;
  timestamp: Date;
  amount: Decimal;
  blockNumber: number;
};

export async function getBlock(
  blockNumber: number,
  _logger: CustomLogger,
): Promise<BlockResponse | null> {
  let lastError: unknown;

  // First endpoint is blockscout, second is etherscan
  const endpoints = [
    {
      url: `${env.EXECUTION_API_URL}/api/v2/blocks/${blockNumber}`,
      process: (response: AxiosResponse<Blockscout_Blocks>) => {
        const blockInfo = response.data;
        const minerReward = blockInfo.rewards.find((r) => r.type === 'Miner Reward');

        if (
          !blockInfo.miner ||
          !blockInfo.miner.hash ||
          blockInfo.miner.hash == '' ||
          !minerReward ||
          // It's quite weird that a blocks comes with 0, specially on mainnet
          // if this happens we check the second endpoint
          new Decimal(minerReward.reward).eq(0)
        ) {
          // logger.warn('Unexpected block response', blockInfo);
          // return null;
          throw new Error(`Unexpected block response: ${JSON.stringify(blockInfo)}`);
        }

        const result: BlockResponse = {
          address: blockInfo.miner.hash,
          timestamp: new Date(blockInfo.timestamp),
          amount: minerReward ? new Decimal(minerReward.reward) : new Decimal(0),
          blockNumber: blockInfo.height,
        };
        return result;
      },
    },
    {
      url: `${env.EXECUTION_API_BKP_URL}/api?chainid=${env.NODE_SENTINEL_CHAIN == 'ethereum' ? '1' : '100'}&module=block&action=getblockreward&blockno=${blockNumber}&apikey=${env.EXECUTION_API_BKP_KEY}`,
      process: (response: AxiosResponse<Etherscan_BlockReward>) => {
        const blockInfo = response.data;
        const result: BlockResponse = {
          address: blockInfo.result.blockMiner,
          timestamp: new Date(Number(blockInfo.result.timeStamp) * 1000),
          amount: new Decimal(blockInfo.result.blockReward),
          blockNumber: Number(blockInfo.result.blockNumber),
        };
        return result;
      },
    },
  ];

  // Try each endpoint
  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    try {
      const response = await instance.get(endpoint.url);
      return endpoint.process(response);
    } catch (error) {
      lastError = error;

      // Wait one slot before trying the next endpoint
      if (i < endpoints.length - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS}s`)),
        );
      }
    }
  }

  // If all endpoints fail, throw the last error
  throw lastError;
}
