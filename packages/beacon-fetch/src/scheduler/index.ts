import { SimpleIntervalJob } from "toad-scheduler";
import { scheduler } from "@/src/lib/scheduler.js";
import { getOldestAttestationsTask } from "@/src/scheduler/tasks/attestations.js";
import { callSummarizeAttestationsHourly } from "@/src/scheduler/tasks/summarize.js";

export function scheduleTasks() {
  // Fetch the attestations for the current slot and store them in the Attestations table.
  scheduler.addSimpleIntervalJob(
    new SimpleIntervalJob(
      { seconds: 1, runImmediately: true },
      getOldestAttestationsTask,
      {
        id: "getOldestAttestation",
        preventOverrun: true,
      }
    )
  );

  // Summarize the attestations for the current hour and store them in the db.
  scheduler.addSimpleIntervalJob(
    new SimpleIntervalJob(
      { seconds: 60, runImmediately: true },
      callSummarizeAttestationsHourly,
      {
        id: "summarizeAttestationsHourly",
        preventOverrun: true,
      }
    )
  );
}
