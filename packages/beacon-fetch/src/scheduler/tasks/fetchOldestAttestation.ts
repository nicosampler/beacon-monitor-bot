import { fetchOldestAttestation } from "@/src/feed/fetchOldestAttestation.js";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";

const ID = "fetchOldestAttestation";

// TODO: move fetchOldestAttestation to this file.

export const job = new SimpleIntervalJob(
  { seconds: 1, runImmediately: true },
  new AsyncTask(`${ID}_task`, fetchOldestAttestation),
  {
    id: ID,
    preventOverrun: true,
  }
);
