import { scheduler } from "@/src/lib/scheduler.js";
import { job as summarizeHourlyJob } from "@/src/scheduler/tasks/summarizeHourly.js";
import { job as executionRewardsJob } from "@/src/scheduler/tasks/executionRewards.js";
import { job as fetchOldestAttestationJob } from "@/src/scheduler/tasks/fetchOldestAttestation.js";
import { job as validatorsBalancesJob } from "@/src/scheduler/tasks/fetchValidatorsBalances.js";
import { job as fetchValidatorsInfo } from "@/src/scheduler/tasks/fetchValidatorsInfo.js";
import { job as fetchBeaconRewardsJob } from "@/src/scheduler/tasks/fetchBeaconRewards.js";
import { job as summarizeDailyJob } from "@/src/scheduler/tasks/summarizeDaily.js";
import { job as cleanupCommitteeJob } from "@/src/scheduler/tasks/cleanupCommittee.js";
import { job as fetchCommitteeJob } from "@/src/scheduler/tasks/fetchCommittee.js";
//import { job as maintainCommitteeJob } from "@/src/scheduler/tasks/maintainCommittee.js";

// TODO: re-think the scheduler tasks.
// Easy way to disable/enable logs for a task.
// Easy way to share IDs.
// Easy way to see the schedule time at a glance.
// Unify how to create logger when there is no ID. (createLogger refactor)
// Move the logic that prevents the task to run to the task function, instead of the implementation.
// Logger errors should ALWAYS be logged.

export function scheduleTasks() {
  // Fetch the oldest attestation
  scheduler.addSimpleIntervalJob(fetchCommitteeJob);
  scheduler.addSimpleIntervalJob(fetchOldestAttestationJob);
  // Fetch the validators balances for updating the validator balances in the db.
  scheduler.addSimpleIntervalJob(validatorsBalancesJob);
  // Check for validators info, like status, withdrawal address, etc.
  scheduler.addSimpleIntervalJob(fetchValidatorsInfo);
  // Fetch the execution rewards for the current block and store them in the db.
  scheduler.addSimpleIntervalJob(executionRewardsJob);
  // Fetch the beacon rewards for the current epoch and store them in the db
  scheduler.addSimpleIntervalJob(fetchBeaconRewardsJob);
  // Summarize hourly attestation and rewards
  scheduler.addSimpleIntervalJob(summarizeHourlyJob);
  // Summarize daily attestation and rewards
  scheduler.addSimpleIntervalJob(summarizeDailyJob);
  // Maintenance tasks
  scheduler.addSimpleIntervalJob(cleanupCommitteeJob);
}
