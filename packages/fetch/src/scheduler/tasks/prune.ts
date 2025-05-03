import { AsyncTask, SimpleIntervalJob } from 'toad-scheduler';

import createLogger, { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';
import { scheduler } from '@/src/lib/scheduler.js';
import { TaskOptions } from '@/src/scheduler/tasks/types.js';

const prisma = getPrisma();

async function pruneTask(logger: CustomLogger) {
  try {
    logger.info('Starting VACUUM FULL');

    await prisma.$executeRaw`VACUUM FULL "Committee"`;
    await prisma.$executeRaw`VACUUM FULL "HourlyValidatorStats"`;
    //await prisma.$executeRaw`VACUUM FULL "DailyValidatorStats"`;

    logger.info('VACUUM FULL completed successfully');
  } catch (error) {
    logger.error('Error running VACUUM FULL on tables:', error);
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
