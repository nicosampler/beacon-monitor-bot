import { AsyncTask, SimpleIntervalJob } from 'toad-scheduler';

import { fetchValidatorsBalances } from '@/src/feed/fetchValidatorsBalances.js';
import createLogger from '@/src/lib/pino.js';
import { scheduler } from '@/src/lib/scheduler.js';
import { TaskOptions } from '@/src/scheduler/tasks/types.js';

export function scheduleFetchValidatorsBalances({
  id,
  logsEnabled,
  intervalMs,
  runImmediately,
  preventOverrun,
}: TaskOptions) {
  const logger = createLogger(id, logsEnabled);
  const task = new AsyncTask(`${id}_task`, () => {
    return fetchValidatorsBalances(logger).catch((e) => logger.error('TASK-CATCH', e.message));
  });

  scheduler.addSimpleIntervalJob(
    new SimpleIntervalJob({ milliseconds: intervalMs, runImmediately }, task, {
      id,
      preventOverrun,
    }),
  );
}
