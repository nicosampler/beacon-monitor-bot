import { PK, RPC_URL } from "@/src/constants/index.js";
import { ethers } from "ethers";
import emp from "ethers-multicall-provider";
console.log(RPC_URL);

// export const batchProvider = new ethers.providers.JsonRpcBatchProvider(RPC_URL);
export const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

export const multicallProvider = emp.MulticallWrapper.wrap(provider);

export const signer = new ethers.Wallet(PK, provider);
