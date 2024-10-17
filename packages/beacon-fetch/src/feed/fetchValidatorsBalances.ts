import { getValidatorsBalances } from "@/src/beacon/endpoints.js";
import { getPrisma } from "@/src/lib/prisma.js";
import createLogger from "@/src/lib/pino.js";
import { CustomLogger } from "@/src/lib/pino.js";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = getPrisma();

function logValidatorBalances(
  logger: CustomLogger,
  validatorCount: number,
  batchCount: number
): void {
  logger.info(
    `Processed ${validatorCount} validators in ${batchCount} batches`
  );
}

export const fetchValidatorsBalances = async (): Promise<void> => {
  const logger = createLogger(`FetchValidatorsBalances`);

  try {
    logger.info(`Fetching for state head`);
    const validatorBalances = await getValidatorsBalances("head");

    logger.info(`Processing ${validatorBalances.length} validator balances`);
    const batchSize = 5000;
    let batchCount = 0;

    for (let i = 0; i < validatorBalances.length; i += batchSize) {
      const batch = validatorBalances.slice(i, i + batchSize);
      batchCount++;

      await prisma.$transaction(async (tx) => {
        for (const validator of batch) {
          const validatorId = parseInt(validator.index);
          const balance = new Decimal(validator.balance);

          await tx.validator.upsert({
            where: { id: validatorId },
            update: { balance },
            create: {
              id: validatorId,
              balance,
            },
          });
        }
      });
    }

    logValidatorBalances(logger, validatorBalances.length, batchCount);
    logger.info(`done.`);
  } catch (error) {
    logger.error(`Error in fetchValidatorsBalances for state head`, {
      error,
    });
    throw error;
  }
};
