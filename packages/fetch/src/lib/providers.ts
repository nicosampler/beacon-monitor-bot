import { createPublicClient, http } from 'viem';
import { gnosis } from 'viem/chains';

import { env } from '@/src/env.js';

// Private instance variable
let instance: ReturnType<typeof createPublicClient> | null = null;

// Function to get or create the client instance
export const getPublicClient = () => {
  if (!instance) {
    instance = createPublicClient({
      chain: gnosis,
      transport: http(env.EXECUTION_RPC_URL),
    });
  }
  return instance;
};
