import { fetchOldestAttestation } from "@/src/feed/fetchOldestAttestation.js";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";

const ID = "fetchOldestAttestation";

const fetchOldestAttestationsTask = new AsyncTask(`${ID}_task`, () =>
  fetchOldestAttestation()
);

export const job = new SimpleIntervalJob(
  { seconds: 1, runImmediately: true },
  fetchOldestAttestationsTask,
  {
    id: ID,
    preventOverrun: true,
  }
);
