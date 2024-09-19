import { env } from "@/src/env.js";
import { SimpleIntervalJob } from "toad-scheduler";
import { scheduler } from "@/src/lib/scheduler.js";
import {
  getHeadAttestationsTask,
  getMissingAttestationsTask,
} from "@/src/scheduler/tasks/attestations.js";

const getHeadAttestationsJob = new SimpleIntervalJob(
  { seconds: env.BEACON_SLOT_DURATION, runImmediately: true },
  getHeadAttestationsTask,
  {
    id: "getHeadAttestations",
    preventOverrun: true,
  }
);

const getMissingAttestationsJob = new SimpleIntervalJob(
  { seconds: 0.5, runImmediately: true },
  getMissingAttestationsTask,
  {
    id: "getMissingAttestations",
    preventOverrun: true,
  }
);

export function scheduleTasks() {
  // Fetch the attestations for the current slot and store them in the Attestations table.
  scheduler.addSimpleIntervalJob(getHeadAttestationsJob);

  // If for some reason the attestations for a past slot were not fetched, this task will fetch them.
  // Fetch the attestations for the missing slots and store them in the Attestations table.
  scheduler.addSimpleIntervalJob(getMissingAttestationsJob);

  // TODO: clear slot information older than BEACON_LOOK_BACK_DAYS
}
