import { Decimal } from '@prisma/client/runtime/library';

import { getBlock } from '@/src/execution/endpoints.js';
import { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';
import { getPublicClient } from '@/src/lib/providers.js';

const prisma = getPrisma();

export async function fetchExecutionRewards(logger: CustomLogger, blockToQuery: number) {
  try {
    const blockInfo = await getBlock(blockToQuery, logger);
    if (!blockInfo) {
      logger.warn('No block provided');
      return;
    }
    await prisma.executionRewards.create({
      data: blockInfo,
    });
    logger.info('done.');
  } catch (error) {
    logger.warn('Not found', error);
    const timestamp = await getPublicClient().getBlock({ blockNumber: BigInt(blockToQuery) });

    await prisma.executionRewards.create({
      data: {
        address: '',
        timestamp: new Date(Number(timestamp.timestamp)),
        amount: new Decimal(0),
        blockNumber: blockToQuery,
      },
    });
  }
}
