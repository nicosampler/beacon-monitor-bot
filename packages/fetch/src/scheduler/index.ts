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
import { schedulerUpdateDailyRewards_validatorsStats } from '@/src/scheduler/tasks/updateDailyRewards_validatorsStats.js';
import { schedulerUpdateMonthlyRewards_validatorsStats } from '@/src/scheduler/tasks/updateMonthlyRewards_validatorsStats.js';
import { schedulerUpdateValidatorStatus_validatorsStats } from '@/src/scheduler/tasks/updateValidatorStatus_validatorsStats.js';
import { schedulerUpdateWeeklyRewards_validatorsStats } from '@/src/scheduler/tasks/updateWeeklyRewards_validatorsStats.js';

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
    logsEnabled: false,
    intervalMs: ms('2m'),
    runImmediately: true,
    preventOverrun: true,
  });
  scheduleFetchAttestations({
    id: 'FetchAttestations',
    logsEnabled: false,
    intervalMs: isEthereum ? ms('3s') : ms('2.5s'),
    runImmediately: true,
    preventOverrun: true,
  });
  scheduleFetchExecutionRewards({
    id: 'FetchExecutionRewards',
    logsEnabled: false,
    intervalMs: isEthereum ? ms('3s') : ms('2.5s'),
    runImmediately: true,
    preventOverrun: true,
  });
  scheduleFetchBlockAndSyncRewards({
    id: 'FetchBlockAndSyncRewards',
    logsEnabled: false,
    intervalMs: isEthereum ? ms('3s') : ms('2.5s'),
    runImmediately: true,
    preventOverrun: true,
  });
  scheduleFetchEpochInfo({
    id: 'FetchEpochInfo',
    logsEnabled: true,
    intervalMs: ms('10s'),
    runImmediately: true,
    preventOverrun: true,
  });
  scheduleSummarizeHourly({
    id: 'SummarizeHourly',
    logsEnabled: false,
    intervalMs: ms('15m'),
    runImmediately: false,
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
    logsEnabled: false,
    intervalMs: ms('1h'),
    runImmediately: false,
    preventOverrun: true,
  });
  //New schedulers for ValidatorsStats table
  schedulerUpdateValidatorStatus_validatorsStats({
    id: 'UpdateValidatorStatus_validatorsStats',
    logsEnabled: false,
    intervalMs: ms('30s'),
    runImmediately: true,
    preventOverrun: true,
  });
  schedulerUpdateDailyRewards_validatorsStats({
    id: 'UpdateDailyRewards_validatorsStats',
    logsEnabled: false,
    intervalMs: ms('15m'),
    runImmediately: true,
    preventOverrun: true,
  });
  schedulerUpdateWeeklyRewards_validatorsStats({
    id: 'UpdateWeeklyRewards_validatorsStats',
    logsEnabled: false,
    intervalMs: ms('1h'),
    runImmediately: true,
    preventOverrun: true,
  });
  schedulerUpdateMonthlyRewards_validatorsStats({
    id: 'UpdateMonthlyRewards_validatorsStats',
    logsEnabled: false,
    intervalMs: ms('3h'),
    runImmediately: true,
    preventOverrun: true,
  });
}
