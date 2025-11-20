import axios from 'axios';

import {
  UserValidatorsInfo,
  GetWithdrawalAddressesResponse,
  GetValidatorIdsResponse,
  AddWithdrawalAddressesRequest,
  AddWithdrawalAddressesResponse,
  AddLidoOperatorValidatorsResponse,
} from '../apiTypes.js';

import { api } from './index.js';

export async function getUserValidatorsInfo(loginId: string): Promise<UserValidatorsInfo> {
  try {
    const response = await api.get<UserValidatorsInfo>(`/api/user/${loginId}/validatorsInfo`);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `Failed to fetch missed attestations: ${error.response?.data?.error || error.message}`,
      );
    }
    throw error;
  }
}

// GET withdrawal addresses
export async function getWithdrawalAddresses(
  loginId: string,
): Promise<GetWithdrawalAddressesResponse> {
  try {
    const response = await api.get<GetWithdrawalAddressesResponse>(
      `/api/user/${loginId}/withdrawal-addresses`,
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `Failed to fetch withdrawal addresses: ${error.response?.data?.error || error.message}`,
      );
    }
    throw error;
  }
}

// POST withdrawal addresses
export async function addWithdrawalAddresses(
  loginId: string,
  request: AddWithdrawalAddressesRequest,
): Promise<AddWithdrawalAddressesResponse> {
  try {
    const response = await api.post<AddWithdrawalAddressesResponse>(
      `/api/user/${loginId}/withdrawal-addresses`,
      request,
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `Failed to add withdrawal addresses: ${error.response?.data?.error || error.message}`,
      );
    }
    throw error;
  }
}

// DELETE withdrawal addresses
export async function removeWithdrawalAddresses(
  loginId: string,
  request: AddWithdrawalAddressesRequest,
): Promise<void> {
  try {
    await api.delete(`/api/user/${loginId}/withdrawal-addresses`, {
      data: request,
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `Failed to remove withdrawal addresses: ${error.response?.data?.error || error.message}`,
      );
    }
    throw error;
  }
}

// GET validator IDs
export async function getValidatorIds(loginId: string): Promise<GetValidatorIdsResponse> {
  try {
    const response = await api.get<GetValidatorIdsResponse>(`/api/user/${loginId}/validator-ids`);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `Failed to fetch validator IDs: ${error.response?.data?.error || error.message}`,
      );
    }
    throw error;
  }
}

// POST validator IDs
export async function addValidatorIds(
  loginId: string,
  request: { validatorIds: number[] },
): Promise<void> {
  try {
    await api.post(`/api/user/${loginId}/validator-ids`, request);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `Failed to add validator IDs: ${error.response?.data?.error || error.message}`,
      );
    }
    throw error;
  }
}

// DELETE validator IDs
export async function removeValidatorIds(
  loginId: string,
  request: { validatorIds: number[] },
): Promise<void> {
  try {
    await api.delete(`/api/user/${loginId}/validator-ids`, {
      data: request,
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `Failed to remove validator IDs: ${error.response?.data?.error || error.message}`,
      );
    }
    throw error;
  }
}

export async function addLidoOperatorValidators(
  loginId: string,
  request: { operatorId: number; pubkeys: string[] },
): Promise<AddLidoOperatorValidatorsResponse> {
  try {
    const response = await api.post<AddLidoOperatorValidatorsResponse>(
      `/api/user/${loginId}/lido-operator-validators`,
      request,
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `Failed to add Lido CSM validators: ${error.response?.data?.error || error.message}`,
      );
    }
    throw error;
  }
}

export async function removeLidoOperatorValidators(
  loginId: string,
  request: { pubkeys: string[] },
): Promise<{
  operatorId: string;
  matchedValidators: number;
  validatorsDisconnected: number;
  userMissingPubKeys: string[];
}> {
  try {
    const response = await api.post<{
      operatorId: string;
      matchedValidators: number;
      validatorsDisconnected: number;
      userMissingPubKeys: string[];
    }>(`/api/user/${loginId}/remove-lido-operator-validators`, request);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `Failed to remove Lido CSM validators: ${
          error.response?.data?.error || error.message
        }`,
      );
    }
    throw error;
  }
}
