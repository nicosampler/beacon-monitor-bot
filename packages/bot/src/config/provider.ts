import { ethers } from 'ethers';
import emp from 'ethers-multicall-provider';

import { env } from '@/src/env.js';

export const provider = new ethers.providers.JsonRpcProvider(env.EXECUTION_RPC_URL);

export const multicallProvider = emp.MulticallWrapper.wrap(provider);

export const signer = new ethers.Wallet(env.NODE_SENTINEL_PRIVATE_KEY, provider);
