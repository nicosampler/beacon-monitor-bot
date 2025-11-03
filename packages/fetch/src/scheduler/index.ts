import ms from 'ms';

import { scheduleCleanupCommittee } from '@/src/scheduler/tasks/cleanupCommittee.js';
import { scheduleFetchExecutionRewards } from '@/src/scheduler/tasks/executionRewards.js';
import { scheduleFetchAttestations } from '@/src/scheduler/tasks/fetchAttestations.js';
import { scheduleFetchBeaconRewards } from '@/src/scheduler/tasks/fetchBeaconRewards.js';
import { scheduleFetchBlockAndSyncRewards } from '@/src/scheduler/tasks/fetchBlockAndSyncRewards.js';
import { scheduleFetchCommittee } from '@/src/scheduler/tasks/fetchCommittee.js';
import { scheduleFetchValidatorsBalances } from '@/src/scheduler/tasks/fetchValidatorsBalances.js';
import { scheduleFetchValidatorsInfo } from '@/src/scheduler/tasks/fetchValidatorsInfo.js';
import { schedulePrune } from '@/src/scheduler/tasks/prune.js';
import { scheduleSummarizeDaily } from '@/src/scheduler/tasks/summarizeDaily.js';
import { scheduleSummarizeHourly } from '@/src/scheduler/tasks/summarizeHourly.js';

// Move the logic that prevents the task to run to the task function, instead of the implementation.
export function scheduleTasks() {
  scheduleFetchCommittee({
    id: 'FetchCommittee',
    logsEnabled: false,
    intervalMs: ms('10s'),
    runImmediately: true,
    preventOverrun: true,
  });
  scheduleFetchAttestations({
    id: 'FetchAttestations',
    logsEnabled: true,
    intervalMs: ms('1s'),
    runImmediately: true,
    preventOverrun: true,
  });
  scheduleFetchExecutionRewards({
    id: 'FetchExecutionRewards',
    logsEnabled: false,
    intervalMs: ms('5s'),
    runImmediately: true,
    preventOverrun: true,
  });
  scheduleFetchBeaconRewards({
    id: 'FetchBeaconRewards',
    logsEnabled: false,
    intervalMs: ms('10s'),
    runImmediately: true,
    preventOverrun: true,
  });
  scheduleFetchBlockAndSyncRewards({
    id: 'FetchBlockAndSyncRewards',
    logsEnabled: false,
    intervalMs: ms('1s'),
    runImmediately: true,
    preventOverrun: true,
  });
  scheduleFetchValidatorsBalances({
    id: 'FetchValidatorsBalances',
    logsEnabled: false,
    intervalMs: ms('30m'),
    runImmediately: false,
    preventOverrun: true,
  });
  scheduleFetchValidatorsInfo({
    id: 'FetchValidatorsInfo',
    logsEnabled: false,
    intervalMs: ms('30m'),
    runImmediately: false,
    preventOverrun: true,
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
    logsEnabled: false,
    intervalMs: ms('1h'),
    runImmediately: false,
    preventOverrun: true,
  });
  scheduleCleanupCommittee({
    id: 'CleanupCommittee',
    logsEnabled: false,
    intervalMs: ms('30m'),
    runImmediately: false,
    preventOverrun: true,
  });
  schedulePrune({
    id: 'Prune',
    logsEnabled: true,
    intervalMs: ms('1h'),
    runImmediately: false,
    preventOverrun: true,
  });
}
