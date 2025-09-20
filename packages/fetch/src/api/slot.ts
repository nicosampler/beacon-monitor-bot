import axios from 'axios';

import { api } from './index.js';

export async function geSlotsInfo() {
  try {
    const response = await api.get(`/api/slot/info`);
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
