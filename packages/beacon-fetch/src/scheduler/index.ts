import { scheduleFetchExecutionRewards } from "@/src/scheduler/tasks/executionRewards.js";
import { scheduleFetchAttestations } from "@/src/scheduler/tasks/fetchAttestations.js";
import { scheduleFetchValidatorsBalances } from "@/src/scheduler/tasks/fetchValidatorsBalances.js";
import { scheduleFetchValidatorsInfo } from "@/src/scheduler/tasks/fetchValidatorsInfo.js";
import { scheduleFetchBeaconRewards } from "@/src/scheduler/tasks/fetchBeaconRewards.js";
import { scheduleFetchCommittee } from "@/src/scheduler/tasks/fetchCommittee.js";
import { scheduleFetchBlockAndSyncRewards } from "@/src/scheduler/tasks/fetchBlockAndSyncRewards.js";
import { job as summarizeHourlyJob } from "@/src/scheduler/tasks/summarizeHourly.js";
import { job as summarizeDailyJob } from "@/src/scheduler/tasks/summarizeDaily.js";
import { job as cleanupCommitteeJob } from "@/src/scheduler/tasks/maintainCommittee.js";
import ms from "ms";
import { scheduler } from "@/src/lib/scheduler.js";

// Move the logic that prevents the task to run to the task function, instead of the implementation.
export function scheduleTasks() {
  scheduleFetchCommittee({
    id: "FetchCommittee",
    logsEnabled: false,
    intervalMs: ms("5s"),
    runImmediately: true,
    preventOverrun: true,
  });

  scheduleFetchAttestations({
    logsEnabled: false,
    interval: ms("2s"),
    ID: "FetchAttestations",
  });

  scheduleFetchExecutionRewards({
    logsEnabled: false,
    interval: ms("2s"),
    ID: "FetchExecutionRewards",
  });

  scheduleFetchBeaconRewards({
    logsEnabled: false,
    interval: ms("20s"),
    ID: "FetchBeaconRewards",
  });

  scheduleFetchBlockAndSyncRewards({
    logsEnabled: true,
    interval: ms("2s"),
    ID: "FetchBlockAndSyncRewards",
  });

  scheduleFetchValidatorsBalances({
    logsEnabled: true,
    interval: ms("10m"),
    ID: "FetchValidatorsBalances",
  });

  scheduleFetchValidatorsInfo({
    logsEnabled: true,
    interval: ms("10m"),
    ID: "FetchValidatorsInfo",
  });

  //  Summarize hourly attestation and rewards
  scheduler.addSimpleIntervalJob(summarizeHourlyJob);
  // Summarize daily attestation and rewards
  scheduler.addSimpleIntervalJob(summarizeDailyJob);
  // Maintenance tasks
  scheduler.addSimpleIntervalJob(cleanupCommitteeJob);
}
