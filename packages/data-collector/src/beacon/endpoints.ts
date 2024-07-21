import { instance } from "@/src/beacon/instance.js";
import { GetAttestations, GetCommittees } from "@/src/beacon/types.js";
import { env } from "@/src/env.js";
import { AxiosError } from "axios";

export async function getCommittees(
  status: string | number
): Promise<GetCommittees["data"]> {
  const results = await instance.get<GetCommittees>(
    `${env.BEACON_API_URL}/eth/v1/beacon/states/${status}/committees`
  );
  return results.data.data;
}

export async function getAttestations(
  status: string | number
): Promise<GetAttestations["data"] | "SLOT MISSED"> {
  try {
    const res = await instance.get<GetAttestations>(
      `${env.BEACON_API_URL}/eth/v1/beacon/blocks/${status}/attestations`
    );
    return res.data.data;
  } catch (error) {
    // If the slot was skipped, the endpoint will return a 404
    if ((error as AxiosError).response?.status === 404) {
      return "SLOT MISSED";
    }
    throw error;
  }
}
