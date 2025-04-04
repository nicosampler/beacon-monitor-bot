import axios from 'axios';

import { UserValidatorsInfo } from '../apiTypes.js';

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
