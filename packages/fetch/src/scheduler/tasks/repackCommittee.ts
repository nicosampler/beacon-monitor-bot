import { AsyncTask, SimpleIntervalJob } from 'toad-scheduler';

import createLogger, { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';
import { scheduler } from '@/src/lib/scheduler.js';
import { TaskOptions } from '@/src/scheduler/tasks/types.js';

const prisma = getPrisma();

async function repackCommitteeTask(logger: CustomLogger) {
  try {
    logger.info('Starting pg_repack on Committee table');

    // Execute pg_repack on the Committee table
    await prisma.$executeRaw`SELECT pg_repack('"Committee"')`;

    logger.info('pg_repack completed successfully');
  } catch (error) {
    logger.error('Error running pg_repack on Committee table:', error);
  }
}

export function scheduleRepackCommittee({
  id,
  logsEnabled,
  intervalMs,
  runImmediately,
  preventOverrun,
}: TaskOptions) {
  const logger = createLogger(id, logsEnabled);

  const task = new AsyncTask(`${id}_task`, () =>
    repackCommitteeTask(logger).catch((e) => {
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
