import ms from 'ms';

import { scheduleCleanupCommittee } from '@/src/scheduler/tasks/cleanupCommittee.js';
import { scheduleFetchExecutionRewards } from '@/src/scheduler/tasks/executionRewards.js';
import { scheduleFetchAttestations } from '@/src/scheduler/tasks/fetchAttestations.js';
import { scheduleFetchBlockAndSyncRewards } from '@/src/scheduler/tasks/fetchBlockAndSyncRewards.js';
import { scheduleFetchCommittee } from '@/src/scheduler/tasks/fetchCommittee.js';
import { scheduleFetchEpochInfo } from '@/src/scheduler/tasks/fetchEpochInfo.js';
import { scheduleFetchValidators } from '@/src/scheduler/tasks/fetchValidators.js';
// import { scheduleFetchValidatorsBalances } from '@/src/scheduler/tasks/fetchValidatorsBalances.js';
import { schedulePrune } from '@/src/scheduler/tasks/prune.js';
import { scheduleSummarizeDaily } from '@/src/scheduler/tasks/summarizeDaily.js';
import { scheduleSummarizeHourly } from '@/src/scheduler/tasks/summarizeHourly.js';

// Move the logic that prevents the task to run to the task function, instead of the implementation.
export function scheduleTasks() {
  scheduleFetchCommittee({
    id: 'FetchCommittee',
    logsEnabled: false,
    intervalMs: ms('5m'),
    runImmediately: true,
    preventOverrun: true,
  });
  // scheduleFetchAttestations({
  //   id: 'FetchAttestations',
  //   logsEnabled: true,
  //   intervalMs: ms('5s'),
  //   runImmediately: true,
  //   preventOverrun: true,
  // });
  // scheduleFetchExecutionRewards({
  //   id: 'FetchExecutionRewards',
  //   logsEnabled: false,
  //   intervalMs: ms('1s'),
  //   runImmediately: true,
  //   preventOverrun: true,
  // });
  scheduleFetchEpochInfo({
    id: 'FetchEpochInfo',
    logsEnabled: true,
    intervalMs: ms('5s'),
    runImmediately: true,
    preventOverrun: true,
  });
  // scheduleFetchBlockAndSyncRewards({
  //   id: 'FetchBlockAndSyncRewards',
  //   logsEnabled: false,
  //   intervalMs: ms('2s'),
  //   runImmediately: true,
  //   preventOverrun: true,
  // });
  // scheduleSummarizeHourly({
  //   id: 'SummarizeHourly',
  //   logsEnabled: false,
  //   intervalMs: ms('15m'),
  //   runImmediately: true,
  //   preventOverrun: true,
  // });
  // scheduleSummarizeDaily({
  //   id: 'SummarizeDaily',
  //   logsEnabled: false,
  //   intervalMs: ms('1h'),
  //   runImmediately: true,
  //   preventOverrun: true,
  // });
  // scheduleCleanupCommittee({
  //   id: 'CleanupCommittee',
  //   logsEnabled: false,
  //   intervalMs: ms('30m'),
  //   runImmediately: true,
  //   preventOverrun: true,
  // });
  // schedulePrune({
  //   id: 'Prune',
  //   logsEnabled: true,
  //   intervalMs: ms('1h'),
  //   runImmediately: true,
  //   preventOverrun: true,
  // });
}
