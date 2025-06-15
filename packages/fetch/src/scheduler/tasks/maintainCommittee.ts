import { SimpleIntervalJob, AsyncTask } from 'toad-scheduler';

import { maintainCommittee } from '@/src/beacon/feed/maintainCommittee.js';
import createLogger from '@/src/lib/pino.js';

const ID = 'maintainCommitteeTable';
const logger = createLogger(ID, true);

export const job = new SimpleIntervalJob(
  { minutes: 30, runImmediately: true },
  new AsyncTask(`${ID}_task`, () =>
    maintainCommittee(logger).catch((e) => logger.error('TASK-CATCH', e)),
  ),
  {
    id: ID,
    preventOverrun: true,
  },
);
