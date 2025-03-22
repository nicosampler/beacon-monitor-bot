import ms from 'ms';

import { scheduleCleanupCommittee } from '@/src/scheduler/tasks/cleanupCommittee.js';
import { scheduleFetchExecutionRewards } from '@/src/scheduler/tasks/executionRewards.js';
import { scheduleFetchAttestations } from '@/src/scheduler/tasks/fetchAttestations.js';
import { scheduleFetchBeaconRewards } from '@/src/scheduler/tasks/fetchBeaconRewards.js';
import { scheduleFetchBlockAndSyncRewards } from '@/src/scheduler/tasks/fetchBlockAndSyncRewards.js';
import { scheduleFetchCommittee } from '@/src/scheduler/tasks/fetchCommittee.js';
import { scheduleFetchValidatorsBalances } from '@/src/scheduler/tasks/fetchValidatorsBalances.js';
import { scheduleFetchValidatorsInfo } from '@/src/scheduler/tasks/fetchValidatorsInfo.js';
import { scheduleSummarizeDaily } from '@/src/scheduler/tasks/summarizeDaily.js';
import { scheduleSummarizeHourly } from '@/src/scheduler/tasks/summarizeHourly.js';

// Move the logic that prevents the task to run to the task function, instead of the implementation.
export function scheduleTasks() {
  scheduleFetchCommittee({
    id: 'FetchCommittee',
    logsEnabled: false,
    intervalMs: ms('5s'),
    runImmediately: true,
    preventOverrun: true,
  });

  scheduleFetchAttestations({
    id: 'FetchAttestations',
    logsEnabled: true,
    intervalMs: ms('2s'),
    runImmediately: true,
    preventOverrun: true,
  });

  scheduleFetchExecutionRewards({
    logsEnabled: false,
    interval: ms('2s'),
    ID: 'FetchExecutionRewards',
  });

  scheduleFetchBeaconRewards({
    logsEnabled: false,
    interval: ms('5s'),
    ID: 'FetchBeaconRewards',
  });

  scheduleFetchBlockAndSyncRewards({
    logsEnabled: false,
    interval: ms('2s'),
    ID: 'FetchBlockAndSyncRewards',
  });

  scheduleFetchValidatorsBalances({
    logsEnabled: false,
    interval: ms('10m'),
    ID: 'FetchValidatorsBalances',
  });

  scheduleFetchValidatorsInfo({
    logsEnabled: false,
    interval: ms('10m'),
    ID: 'FetchValidatorsInfo',
  });

  scheduleSummarizeHourly({
    id: 'SummarizeHourly',
    logsEnabled: true,
    intervalMs: ms('15m'),
    runImmediately: true,
    preventOverrun: true,
  });

  scheduleSummarizeDaily({
    id: 'SummarizeDaily',
    logsEnabled: true,
    intervalMs: ms('1h'),
    runImmediately: true,
    preventOverrun: true,
  });

  scheduleCleanupCommittee({
    id: 'CleanupCommittee',
    logsEnabled: true,
    intervalMs: ms('30m'),
    runImmediately: true,
    preventOverrun: true,
  });
}
