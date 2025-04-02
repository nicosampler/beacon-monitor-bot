import { ethers } from 'ethers';

import { provider } from '@/src/config/provider.js';
import { GBCDepositAbi } from '@/src/constants/GBCDepositAbi.js';
import { env } from '@/src/env.js';

const depositInstance = new ethers.Contract(
  env.BLOCKCHAIN_SC_DEPOSIT_ADDRESS,
  GBCDepositAbi,
  provider,
);

export default depositInstance;
