import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { SLOT_DELAY_TO_FETCH } from "@/src/constants/index.js";
import { pullAttestations } from "@/src/feed/attestations.js";
import createLogger from "@/src/lib/pino.js";

export default function pullHeadAttestations() {
  const logger = createLogger("pullHeadAttestations");
  const now = new Date();
  // Subtract slots to give the network time to receive the attestations
  const slotNumber =
    getSlotNumberFromTimestamp(now.getTime()) - SLOT_DELAY_TO_FETCH;

  logger.info(`Pulling HEAD attestations for slot: ${slotNumber}`);

  return pullAttestations(slotNumber).catch();
}
