import { Decimal } from '@prisma/client/runtime/library';
import { AxiosResponse } from 'axios';
import pRetry from 'p-retry';

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
  logger: CustomLogger,
): Promise<BlockResponse | null> {
  let lastError: unknown;

  // First endpoint is blockscout, second is etherscan
  const endpoints = [
    {
      url: `${env.EXECUTION_API_URL}/api/v2/blocks/${blockNumber}`,
      process: (response: AxiosResponse<Blockscout_Blocks>) => {
        const blockInfo = response.data;
        const minerReward = blockInfo.rewards.find((r) => r.type === 'Miner Reward');

        if (!blockInfo.miner || !blockInfo.miner.hash || blockInfo.miner.hash == '') {
          logger.warn('Unexpected block response', blockInfo);
          return null;
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
      url: `${env.EXECUTION_API_BKP_URL}/api?module=block&action=getblockreward&blockno=${blockNumber}&apikey=${env.EXECUTION_API_BKP_KEY}`,
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
  for (const endpoint of endpoints) {
    try {
      return await pRetry(
        async () => {
          const response = await instance.get(endpoint.url);
          return endpoint.process(response);
        },
        {
          retries: 2,
          minTimeout: 1000,
        },
      );
    } catch (error) {
      lastError = error;
    }
  }

  // If all endpoints fail, throw the last error
  throw lastError;
}
