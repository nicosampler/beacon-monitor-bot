import { ethers } from 'ethers';

import { provider } from '@/src/config/provider.js';
import { CSMModule } from '@/src/constants/CSMModule.js';

// NOTE: Contract address provided by Lido for the Community Staking Module.
export const CSM_MODULE_ADDRESS = '0xdA7dE2ECdDfccC6c3AF10108Db212ACBBf9EA83F' as const;

export const csmModuleInstance = new ethers.Contract(CSM_MODULE_ADDRESS, CSMModule, provider);
