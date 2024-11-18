import { instance } from "@/src/beacon/utils/instance.js";
import {
  AttestationRewards,
  GetAttestations,
  GetCommittees,
  GetValidators,
  GetValidatorsBalances,
  ValidatorStatus,
} from "@/src/beacon/types.js";
import { env } from "@/src/env.js";
import { AxiosError } from "axios";

export async function getCommittees(
  stateId: string | number
): Promise<GetCommittees["data"]> {
  const results = await instance.get<GetCommittees>(
    `${env.BEACON_API_URL}/eth/v1/beacon/states/${stateId}/committees`
  );

  return results.data.data;
}

export async function getAttestations(
  stateId: string | number
): Promise<GetAttestations["data"] | "SLOT MISSED"> {
  // Try primary and backup URLs in sequence
  for (const url of [env.BEACON_API_URL, env.BEACON_API_BKP_URL]) {
    try {
      const res = await instance.get<GetAttestations>(
        `${url}/eth/v1/beacon/blocks/${stateId}/attestations`
      );
      return res.data.data;
    } catch (error) {
      // Check if this is the last URL to try
      if (url === env.BEACON_API_BKP_URL) {
        // Handle 404 case for missed slots
        if (isSlotMissedError(error)) {
          return "SLOT MISSED";
        }
        throw error;
      }
    }
  }
}

// Helper function to check for missed slot errors
function isSlotMissedError(error: unknown): boolean {
  const axiosError = error as AxiosError<{ message: string }>;
  return (
    axiosError.response?.status === 404 &&
    axiosError.response?.data.message.includes("NOT_FOUND: beacon block")
  );
}

export async function getValidatorsBalances(
  stateId: string | number
): Promise<GetValidatorsBalances["data"]> {
  const res = await instance.get<GetValidatorsBalances>(
    `${env.BEACON_API_URL}/eth/v1/beacon/states/${stateId}/validator_balances`
  );
  return res.data.data;
}

export async function getValidatorsInfo(
  stateId: string | number,
  validatorIds: number[],
  status?: ValidatorStatus[]
): Promise<GetValidators["data"]> {
  // Construct query parameters
  const params = new URLSearchParams();

  // Add validator IDs to the query
  validatorIds.forEach((id) => params.append("id", id.toString()));

  // Add status to the query if provided
  status?.forEach((s) => params.append("status", s));

  const res = await instance.get<GetValidators>(
    `${env.BEACON_API_URL}/eth/v1/beacon/states/${stateId}/validators`,
    { params }
  );
  return res.data.data;
}

export async function getAttestationRewards(
  stateId: string | number,
  validatorIds: string[]
) {
  return await instance.post<AttestationRewards>(
    `${env.BEACON_API_URL}/eth/v1/beacon/rewards/attestations/${stateId}`,
    validatorIds
  );
}
