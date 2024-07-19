import pullHeadAttestations from "@/src/db/headAttestations.js";
import { pullMissingAttestations } from "@/src/db/missingAttestations.js";
import { AsyncTask } from "toad-scheduler";

export const getAttestationsHeadTask = new AsyncTask(
  "getAttestationsHead",
  () => pullHeadAttestations()
);

export const getMissingAttestationsTask = new AsyncTask(
  "getMissingAttestationsHead",
  () => pullMissingAttestations()
);
