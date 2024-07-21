import { env } from "@/src/env.js";
import { SimpleIntervalJob } from "toad-scheduler";
import { scheduler } from "@/src/lib/scheduler.js";
import {
  getAttestationsHeadTask,
  getMissingAttestationsTask,
} from "@/src/scheduler/tasks/attestations.js";

const getAttestationsHeadJob = new SimpleIntervalJob(
  { seconds: env.BEACON_SLOT_DURATION, runImmediately: true },
  getAttestationsHeadTask,
  {
    id: "getAttestationsHead",
    preventOverrun: true,
  }
);

const missingAttestationsJob = new SimpleIntervalJob(
  { seconds: 1, runImmediately: true },
  getMissingAttestationsTask,
  {
    id: "getMissingAttestations",
    preventOverrun: true,
  }
);

export function scheduleTasks() {
  // Fetch the attestations for the current slot and store them in the Attestations table.
  scheduler.addSimpleIntervalJob(getAttestationsHeadJob);

  // If for some reason the attestations for a past slot were not fetched, this task will fetch them.
  // Fetch the attestations for the missing slots and store them in the Attestations table.
  // scheduler.addSimpleIntervalJob(missingAttestationsJob);

  // TODO: clear slot information older than BEACON_LOOKBACK_DAYS
}
