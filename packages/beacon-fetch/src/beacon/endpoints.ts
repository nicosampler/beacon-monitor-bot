import { instance } from "@/src/beacon/utils/instance.js";
import {
  AttestationRewards,
  BlockRewards,
  GetAttestations,
  GetCommittees,
  GetValidators,
  GetValidatorsBalances,
  SyncCommitteeRewards,
  ValidatorStatus,
} from "@/src/beacon/types.js";
import { env } from "@/src/env.js";
import { AxiosError } from "axios";
import pRetry from "p-retry";
import memoizee from "memoizee";
import ms from "ms";

// Helper function to check for missed slot errors
function _isSlotMissedError(error: unknown): boolean {
  const axiosError = error as AxiosError<{ message: string }>;
  return (
    axiosError.response?.status === 404 &&
    axiosError.response?.data.message.includes("NOT_FOUND: beacon block")
  );
}

// Generic helper function for making requests with retries and multiple URLs
async function makeBeaconRequest<T>(
  requestBuilder: (url: string) => Promise<T>,
  errorHandler?: (error: unknown) => T | undefined
): Promise<T> {
  let lastError: unknown;

  // Try each URL in sequence
  for (const url of [env.BEACON_API_URL, env.BEACON_API_BKP_URL]) {
    try {
      const result = await pRetry(() => requestBuilder(url), {
        retries: 2,
        minTimeout: 1000,
      });
      return result;
    } catch (error) {
      lastError = error;
    }
  }

  // Handle special error cases if handler provided
  if (errorHandler) {
    const handled = errorHandler(lastError);
    if (handled !== undefined) {
      return handled;
    }
  }

  throw lastError;
}

// Updated functions using the helper
export async function getCommittees(
  epoch: number,
  stateId = "head"
): Promise<GetCommittees["data"]> {
  return makeBeaconRequest(async (url) => {
    const res = await instance.get<GetCommittees>(
      `${url}/eth/v1/beacon/states/${stateId}/committees?epoch=${epoch}`
    );
    return res.data.data;
  });
}

export async function getAttestations(
  stateId: string | number
): Promise<GetAttestations["data"] | "SLOT MISSED"> {
  type AttestationsResponse = GetAttestations["data"];

  return makeBeaconRequest<AttestationsResponse | "SLOT MISSED">(
    async (url) => {
      const res = await instance.get<GetAttestations>(
        `${url}/eth/v1/beacon/blocks/${stateId}/attestations`
      );
      return res.data.data;
    },
    (error) => (_isSlotMissedError(error) ? "SLOT MISSED" : undefined)
  );
}

export async function getValidatorsBalances(
  stateId: string | number
): Promise<GetValidatorsBalances["data"]> {
  return makeBeaconRequest(async (url) => {
    const res = await instance.get<GetValidatorsBalances>(
      `${url}/eth/v1/beacon/states/${stateId}/validator_balances`
    );
    return res.data.data;
  });
}

export async function getValidatorsInfo(
  stateId: string | number,
  validatorIds: number[],
  status?: ValidatorStatus[]
): Promise<GetValidators["data"]> {
  return makeBeaconRequest(async (url) => {
    // Construct query parameters
    const params = new URLSearchParams();
    validatorIds.forEach((id) => params.append("id", id.toString()));
    status?.forEach((s) => params.append("status", s));

    const res = await instance.get<GetValidators>(
      `${url}/eth/v1/beacon/states/${stateId}/validators`,
      { params }
    );
    return res.data.data;
  });
}

export async function getAttestationRewards(
  stateId: string | number,
  validatorIds: string[]
): Promise<AttestationRewards> {
  return makeBeaconRequest(async (url) => {
    const res = await instance.post<AttestationRewards>(
      `${url}/eth/v1/beacon/rewards/attestations/${stateId}`,
      validatorIds
    );
    return res.data;
  });
}

export const getBlockRewards = memoizee(
  async function getBlockRewards(slot: number) {
    return makeBeaconRequest<BlockRewards | "SLOT MISSED">(
      async (url) => {
        const res = await instance.get<BlockRewards>(
          `${url}/eth/v1/beacon/rewards/blocks/${slot}`
        );
        return res.data;
      },
      (error) => (_isSlotMissedError(error) ? "SLOT MISSED" : undefined)
    );
  },
  {
    promise: true,
    maxAge: ms("10m"),
    primitive: true,
  }
);

export const getSyncCommitteeRewards = memoizee(
  async function getSyncCommitteeRewards(slot: number, validatorIds: string[]) {
    return makeBeaconRequest<SyncCommitteeRewards>(async (url) => {
      const res = await instance.post<SyncCommitteeRewards>(
        `${url}/eth/v1/beacon/rewards/sync_committee/${slot}`,
        validatorIds
      );
      return res.data;
    });
  },
  {
    promise: true,
    maxAge: ms("10m"),
    primitive: true,
  }
);
