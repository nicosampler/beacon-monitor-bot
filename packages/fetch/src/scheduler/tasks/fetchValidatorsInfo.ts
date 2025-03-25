import { AsyncTask, SimpleIntervalJob } from 'toad-scheduler';

import { fetchValidatorsInfo } from '@/src/feed/fetchValidatorsInfo.js';
import createLogger from '@/src/lib/pino.js';
import { scheduler } from '@/src/lib/scheduler.js';
import { TaskOptions } from '@/src/scheduler/tasks/types.js';

export function scheduleFetchValidatorsInfo({
  id,
  logsEnabled,
  intervalMs,
  runImmediately,
  preventOverrun,
}: TaskOptions) {
  const logger = createLogger(id, logsEnabled);
  const task = new AsyncTask(`${id}_task`, () => {
    return fetchValidatorsInfo(logger).catch((e) => logger.error('TASK-CATCH', e));
  });

  scheduler.addSimpleIntervalJob(
    new SimpleIntervalJob({ milliseconds: intervalMs, runImmediately }, task, {
      id,
      preventOverrun,
    }),
  );
}
