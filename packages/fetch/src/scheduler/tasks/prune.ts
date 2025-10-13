import { AsyncTask, SimpleIntervalJob } from 'toad-scheduler';

import createLogger, { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';
import { scheduler } from '@/src/lib/scheduler.js';
import { TaskOptions } from '@/src/scheduler/tasks/types.js';

const prisma = getPrisma();

async function pruneTask(logger: CustomLogger) {
  try {
    logger.info('Starting database maintenance operations');

    await prisma.$executeRaw`VACUUM (VERBOSE, ANALYZE) "Committee"`;
    await prisma.$executeRaw`VACUUM (VERBOSE, ANALYZE) "HourlyValidatorStats"`;
    await prisma.$executeRaw`VACUUM (VERBOSE, ANALYZE) "DailyValidatorStats"`;

    // Optional: Check if we can safely run VACUUM FULL when there's more space
    // This could be a separate scheduled task that runs less frequently
    logger.info('Database maintenance completed successfully');
  } catch (error) {
    logger.error('Error running database maintenance operations:', error);
  }
}

export function schedulePrune({
  id,
  logsEnabled,
  intervalMs,
  runImmediately,
  preventOverrun,
}: TaskOptions) {
  const logger = createLogger(id, logsEnabled);

  const task = new AsyncTask(`${id}_task`, () =>
    pruneTask(logger).catch((e) => {
      logger.error('TASK-CATCH', e);
    }),
  );

  const job = new SimpleIntervalJob(
    { milliseconds: intervalMs, runImmediately: runImmediately },
    task,
    {
      id: id,
      preventOverrun: preventOverrun,
    },
  );

  scheduler.addSimpleIntervalJob(job);
}
