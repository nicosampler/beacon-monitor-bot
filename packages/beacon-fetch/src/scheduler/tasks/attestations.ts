import pullHeadAttestations from "@/src/feed/pullHeadAttestations.js";
import { pullMissingAttestations } from "@/src/feed/pullMissingAttestations.js";
import { pullOldestAttestation } from "@/src/feed/pullOldestAttestation.js";
import { AsyncTask } from "toad-scheduler";

export const getHeadAttestationsTask = new AsyncTask(
  "getHeadAttestations",
  () => pullHeadAttestations()
);

export const getMissingAttestationsTask = new AsyncTask(
  "getMissingAttestations",
  () => pullMissingAttestations()
);

export const getOldestAttestationsTask = new AsyncTask(
  "getOldestAttestations",
  () => pullOldestAttestation()
);
