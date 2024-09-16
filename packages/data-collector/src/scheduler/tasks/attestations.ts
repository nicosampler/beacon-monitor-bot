import pullHeadAttestations from "@/src/feed/headAttestations.js";
import { pullMissingAttestations } from "@/src/feed/missingAttestations.js";
import { AsyncTask } from "toad-scheduler";

export const getHeadAttestationsTask = new AsyncTask(
  "getHeadAttestations",
  () => pullHeadAttestations()
);

export const getMissingAttestationsTask = new AsyncTask(
  "getMissingAttestations",
  () => pullMissingAttestations()
);
