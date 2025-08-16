import axios from 'axios';

import { SlotInfoResponse } from '../apiTypes.js';

import { api } from './index.js';

export async function geSlotsInfo(): Promise<SlotInfoResponse> {
  try {
    const response = await api.get<SlotInfoResponse>(`/api/slot/info`);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `Failed to fetch slots info: ${error.response?.data?.error || error.message}`,
      );
    }
    throw error;
  }
}
