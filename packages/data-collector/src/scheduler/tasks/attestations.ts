import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { SLOT_DELAY_TO_FETCH } from "@/src/constants/index.js";
import { pullAttestations } from "@/src/db/attestation.js";
import { pullMissingAttestations } from "@/src/db/missingAttestations.js";
import { AsyncTask } from "toad-scheduler";

export const getAttestationsHeadTask = new AsyncTask(
  "getAttestationsHead",
  () => {
    const now = new Date();
    // Subtract slots to give the network time to receive the attestations
    const slotNumber =
      getSlotNumberFromTimestamp(now.getTime()) - SLOT_DELAY_TO_FETCH;

    return pullAttestations(slotNumber).catch(console.error);
  }
);

export const getMissingAttestationsTask = new AsyncTask(
  "getMissingAttestationsHead",
  () => pullMissingAttestations()
);
