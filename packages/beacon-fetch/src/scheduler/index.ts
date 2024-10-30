import { scheduler } from "@/src/lib/scheduler.js";
import { job as summarizeHourlyJob } from "@/src/scheduler/tasks/summarizeHourly.js";
import { job as executionRewardsJob } from "@/src/scheduler/tasks/executionRewards.js";
import { job as fetchOldestAttestationJob } from "@/src/scheduler/tasks/fetchOldestAttestation.js";
import { job as validatorsBalancesJob } from "@/src/scheduler/tasks/fetchValidatorsBalances.js";
import { job as fetchValidatorsInfo } from "@/src/scheduler/tasks/fetchValidatorsInfo.js";
import { job as fetchBeaconRewardsJob } from "@/src/scheduler/tasks/fetchBeaconRewards.js";
import { job as summarizeDailyJob } from "@/src/scheduler/tasks/summarizeDaily.js";

export function scheduleTasks() {
  // Fetch the oldest attestation
  scheduler.addSimpleIntervalJob(fetchOldestAttestationJob);

  // Fetch the validators balances for updating the validator balances in the db.
  scheduler.addSimpleIntervalJob(validatorsBalancesJob);

  // Check for validators info, like status, withdrawal address, etc.
  scheduler.addSimpleIntervalJob(fetchValidatorsInfo);

  // Fetch the execution rewards for the current block and store them in the db.
  scheduler.addSimpleIntervalJob(executionRewardsJob);

  // Fetch the beacon rewards for the current epoch and store them in the db.
  scheduler.addSimpleIntervalJob(fetchBeaconRewardsJob);

  // Summarize hourly attestation and rewards
  scheduler.addSimpleIntervalJob(summarizeHourlyJob);

  // Summarize daily attestation and rewards
  scheduler.addSimpleIntervalJob(summarizeDailyJob);
}
