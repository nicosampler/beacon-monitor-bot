import { Decimal } from '@prisma/client/runtime/library';
import chunk from 'lodash/chunk.js';
import ms from 'ms';

import { getPrisma } from '@/src/lib/prisma.js';
import { VALIDATOR_STATUS } from '@/src/services/consensus/constants.js';
import { beacon_getValidators } from '@/src/services/consensus/endpoints.js';

const prisma = getPrisma();

// Function to save validators info to database
export async function saveValidatorsToDatabase(
  validatorsInfo: Awaited<ReturnType<typeof beacon_getValidators>>,
) {
  const batches = chunk(validatorsInfo, 10000);

  for (const batch of batches) {
    await prisma.$transaction(
      async (tx) => {
        await tx.validator.createMany({
          data: batch.map((data) => ({
            id: +data.index,
            withdrawalAddress: data.validator.withdrawal_credentials.startsWith('0x')
              ? '0x' + data.validator.withdrawal_credentials.slice(-40)
              : null,
            status: VALIDATOR_STATUS[data.status],
            balance: new Decimal(data.balance),
            effectiveBalance: new Decimal(data.validator.effective_balance),
          })),
        });
      },
      {
        timeout: ms('2m'),
      },
    );
  }
}

export async function fetchValidators(stateId: number | 'head') {
  const batchSize = 1_000_000;
  const totalValidators = 5_000_000;

  // Generate all validator IDs and filter out final state validators
  const allValidatorIds = Array.from({ length: totalValidators }, (_, i) => i);

  // Create chunks of batchSize
  const batches = chunk(allValidatorIds, batchSize);
  let allValidatorsData: Awaited<ReturnType<typeof beacon_getValidators>> = [];
  for (const batchIds of batches) {
    const batchResult = await beacon_getValidators(
      stateId,
      batchIds.map((id) => String(id)),
      null,
    );

    allValidatorsData = [...allValidatorsData, ...batchResult];

    if (batchResult.length < batchSize) {
      break;
    }
  }

  await saveValidatorsToDatabase(allValidatorsData);
}
