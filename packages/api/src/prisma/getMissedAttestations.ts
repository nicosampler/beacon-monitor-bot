import { env } from "@/src/env.js";
import { getPrisma } from "@/src/lib/prisma.js";
import {
  getTimestampFromSlotNumber,
  slotsIn1h,
  VALIDATOR_STATUS,
} from "@/src/utils/beacon.js";
import { Committee } from "@prisma/client";

export async function getMissedAttestations_db(
  userId: number,
  maxSlotToQuery: number
): Promise<(Committee & { timestamp: number })[]> {
  const prisma = getPrisma();

  const res = await prisma.$queryRaw<Committee[]>`
    WITH active_validators AS MATERIALIZED (
      SELECT v.id
      FROM "_UserToValidator" uv 
      JOIN "Validator" v ON v.id = uv."B"
      WHERE uv."A" = ${userId}
      AND v.status IN (${VALIDATOR_STATUS.active_ongoing}, ${VALIDATOR_STATUS.active_exiting})
    )
    SELECT c.* 
    FROM active_validators av
    JOIN LATERAL (
      SELECT *
      FROM "Committee" c
      WHERE c."validatorIndex" = av.id
      AND c.slot BETWEEN ${maxSlotToQuery - slotsIn1h} AND ${maxSlotToQuery}
      AND (
        c."attestationDelay" IS NULL 
        OR c."attestationDelay" > ${env.BEACON_MAX_ATTESTATION_DELAY}
      )
    ) c ON true
    ORDER BY c.slot DESC
  `;

  return res.map((attestation) => ({
    ...attestation,
    timestamp: getTimestampFromSlotNumber(attestation.slot),
  }));
}
