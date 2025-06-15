import ms from 'ms';

import { env } from '@/src/env.js';
import { scheduleCleanupCommittee } from '@/src/scheduler/tasks/cleanupCommittee.js';
import { scheduleFetchExecutionRewards } from '@/src/scheduler/tasks/executionRewards.js';
import { scheduleFetchAttestations } from '@/src/scheduler/tasks/fetchAttestations.js';
import { scheduleFetchBlockAndSyncRewards } from '@/src/scheduler/tasks/fetchBlockAndSyncRewards.js';
import { scheduleFetchCommittee } from '@/src/scheduler/tasks/fetchCommittee.js';
import { scheduleFetchEpochInfo } from '@/src/scheduler/tasks/fetchEpochInfo.js';
import { scheduleFetchSyncCommittees } from '@/src/scheduler/tasks/fetchSyncCommittees.js';
import { schedulePrune } from '@/src/scheduler/tasks/prune.js';
import { scheduleSummarizeDaily } from '@/src/scheduler/tasks/summarizeDaily.js';
import { scheduleSummarizeHourly } from '@/src/scheduler/tasks/summarizeHourly.js';

const isEthereum = env.NODE_SENTINEL_CHAIN === 'ethereum';

// Gnosis epoch: 1.33m
// Ethereum epoch: 6.4m

export function scheduleTasks() {
  scheduleFetchCommittee({
    id: 'FetchCommittee',
    logsEnabled: false,
    intervalMs: isEthereum ? ms('2m') : ms('20s'),
    runImmediately: true,
    preventOverrun: true,
  });
  scheduleFetchSyncCommittees({
    id: 'FetchSyncCommittees',
    logsEnabled: true,
    intervalMs: ms('2m'),
    runImmediately: true,
    preventOverrun: true,
  });
  scheduleFetchAttestations({
    id: 'FetchAttestations',
    logsEnabled: false,
    intervalMs: isEthereum ? ms('6s') : ms('2.5s'),
    runImmediately: true,
    preventOverrun: true,
  });
  scheduleFetchExecutionRewards({
    id: 'FetchExecutionRewards',
    logsEnabled: false,
    intervalMs: isEthereum ? ms('6s') : ms('2.5s'),
    runImmediately: true,
    preventOverrun: true,
  });
  scheduleFetchEpochInfo({
    id: 'FetchEpochInfo',
    logsEnabled: true,
    intervalMs: isEthereum ? ms('2m') : ms('20s'),
    runImmediately: true,
    preventOverrun: true,
  });
  scheduleFetchBlockAndSyncRewards({
    id: 'FetchBlockAndSyncRewards',
    logsEnabled: true,
    intervalMs: isEthereum ? ms('6s') : ms('2.5s'),
    runImmediately: true,
    preventOverrun: true,
  });
  scheduleSummarizeHourly({
    id: 'SummarizeHourly',
    logsEnabled: false,
    intervalMs: ms('15m'),
    runImmediately: true,
    preventOverrun: true,
  });
  scheduleSummarizeDaily({
    id: 'SummarizeDaily',
    logsEnabled: false,
    intervalMs: ms('1h'),
    runImmediately: true,
    preventOverrun: true,
  });
  scheduleCleanupCommittee({
    id: 'CleanupCommittee',
    logsEnabled: false,
    intervalMs: ms('30m'),
    runImmediately: true,
    preventOverrun: true,
  });
  schedulePrune({
    id: 'Prune',
    logsEnabled: true,
    intervalMs: ms('1h'),
    runImmediately: true,
    preventOverrun: true,
  });
}
