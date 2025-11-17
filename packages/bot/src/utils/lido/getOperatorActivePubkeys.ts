import { BigNumber } from 'ethers';

import { csmModuleInstance } from '@/src/utils/evm/csmModule.js';

export async function getOperatorActivePubkeys(nodeOperatorId: number): Promise<string[]> {
  // NOTE: Due to the way the ABI is encoded in CSMModule.ts, ethers returns a plain tuple
  // without the named struct fields. We must rely on positional indexes instead:
  // 0: totalAddedKeys
  // 1: totalWithdrawnKeys
  // 2: totalDepositedKeys
  // 3: totalVettedKeys
  // 4: stuckValidatorsCount
  // 5: depositableValidatorsCount
  // 6: targetLimit
  // 7: targetLimitMode
  // 8: totalExitedKeys
  const nodeOperatorTuple = (await csmModuleInstance.getNodeOperator(
    nodeOperatorId,
  )) as unknown as [
    BigNumber,
    BigNumber,
    number,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    number,
    number,
    ...unknown[],
  ];

  const totalDepositedKeys = nodeOperatorTuple[2];
  const totalExitedKeys = nodeOperatorTuple[8];

  const activeCount = totalDepositedKeys - totalExitedKeys;

  if (activeCount <= 0) {
    return [];
  }

  const keysBytes: string = await csmModuleInstance.getSigningKeys(
    nodeOperatorId,
    totalExitedKeys,
    activeCount,
  );

  // Remove 0x prefix if present.
  const hex = keysBytes.slice(2);

  const PUBKEY_HEX_LENGTH = 96;
  const pubkeys: string[] = [];

  const totalKeys = Math.floor(hex.length / PUBKEY_HEX_LENGTH);

  // Process from last to first.
  for (let i = totalKeys - 1; i >= 0; i--) {
    const start = i * PUBKEY_HEX_LENGTH;
    const end = start + PUBKEY_HEX_LENGTH;
    const chunk = hex.slice(start, end);
    if (chunk.length === PUBKEY_HEX_LENGTH) {
      pubkeys.push(`0x${chunk}`);
    }
  }

  return pubkeys;
}
