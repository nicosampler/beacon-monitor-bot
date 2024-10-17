import { scheduler } from "@/src/lib/scheduler.js";
import { job as summarizeHourlyJob } from "@/src/scheduler/tasks/summarizeHourly.js";
import { job as executionRewardsJob } from "@/src/scheduler/tasks/executionRewards.js";
import { job as fetchOldestAttestationJob } from "@/src/scheduler/tasks/fetchOldestAttestation.js";

export function scheduleTasks() {
  // Fetch the oldest attestation
  scheduler.addSimpleIntervalJob(fetchOldestAttestationJob);
  // Fetch the execution rewards for the current block and store them in the db.
  scheduler.addSimpleIntervalJob(executionRewardsJob);

  // Summarize the attestations for the current hour and store them in the db.
  scheduler.addSimpleIntervalJob(summarizeHourlyJob);
}
