import { differenceInSeconds } from 'date-fns';
import { SimpleIntervalJob, AsyncTask } from 'toad-scheduler';

import { env } from '@/src/env.js';
import { fetchExecutionRewards } from '@/src/feed/fetchExecutionRewards.js';
import createLogger, { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';
import { scheduler } from '@/src/lib/scheduler.js';
import { TaskOptions } from '@/src/scheduler/tasks/types.js';

const prisma = getPrisma();

const _fetchExecutionRewardsTask = async (logger: CustomLogger) => {
  const latestReward = await prisma.executionRewards.findFirst({
    orderBy: { blockNumber: 'desc' },
  });

  let blockToQuery: number;

  if (latestReward) {
    const now = new Date();
    const secondsSinceLastBlock = Math.abs(differenceInSeconds(now, latestReward.timestamp));
    if (secondsSinceLastBlock < env.BEACON_SLOT_DURATION_IN_SECONDS) {
      logger.info(`Skipping, too close to the head.`);
      return;
    }
    blockToQuery = latestReward.blockNumber + 1;
  } else {
    blockToQuery = env.EXECUTION_BLOCK_LOOKBACK;
  }

  logger.addContext(`for block ${blockToQuery}`);

  await fetchExecutionRewards(logger, blockToQuery);
};

export function scheduleFetchExecutionRewards({
  id,
  logsEnabled,
  intervalMs,
  runImmediately,
  preventOverrun,
}: TaskOptions) {
  const logger = createLogger(id, logsEnabled);

  const task = new AsyncTask(`${id}_task`, () => {
    return _fetchExecutionRewardsTask(logger).catch((e) => logger.error('TASK-CATCH', e.message));
  });

  scheduler.addSimpleIntervalJob(
    new SimpleIntervalJob({ milliseconds: intervalMs, runImmediately }, task, {
      id,
      preventOverrun,
    }),
  );
}
