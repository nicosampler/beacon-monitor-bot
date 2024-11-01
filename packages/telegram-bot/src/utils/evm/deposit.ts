import { ethers } from "ethers";
import { GBCDepositAbi } from "@/src/constants/GBCDepositAbi.js";

import { provider } from "@/src/config/provider.js";
import { SC_DEPOSIT_ADDRESS } from "@/src/constants/index.js";

const depositInstance = new ethers.Contract(
  SC_DEPOSIT_ADDRESS,
  GBCDepositAbi,
  provider
);

export default depositInstance;
