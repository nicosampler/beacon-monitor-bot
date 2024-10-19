import { PrismaClient, Prisma } from "@prisma/client";
import { getValidatorsInfo } from "@/src/beacon/endpoints.js";
import createLogger from "@/src/lib/pino.js";
import { getHighestValidatorId } from "@/src/feed/utils.js";
import chunk from "lodash/chunk.js";
import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { env } from "@/src/env.js";
import { VALIDATOR_STATUS } from "@/src/constants/index.js";

const prisma = new PrismaClient();
const logger = createLogger("fetchValidatorsInfo");

export async function fetchValidatorsInfo() {
  const highestValidatorId = await getHighestValidatorId();
  const maxValidatorId = highestValidatorId;
  const batchSize = 6500;
  const slotNumber =
    getSlotNumberFromTimestamp(Date.now()) - env.BEACON_SLOTS_PER_EPOCH;

  // Fetch validator IDs that are in final states
  const finalStateValidators = await prisma.validator.findMany({
    where: {
      status: {
        in: [
          VALIDATOR_STATUS.EXITED_UNSLASHED,
          VALIDATOR_STATUS.EXITED_SLASHED,
          VALIDATOR_STATUS.WITHDRAWAL_DONE,
        ],
      },
    },
    select: { id: true },
  });

  const finalStateValidatorIds = new Set(finalStateValidators.map((v) => v.id));

  // Create array of all validator IDs and filter out those in final states
  const allValidatorIds = Array.from(
    { length: maxValidatorId + 1 },
    (_, i) => i
  ).filter((id) => !finalStateValidatorIds.has(id));

  const validatorIdBatches = chunk(allValidatorIds, batchSize);

  for (const validatorIds of validatorIdBatches) {
    try {
      logger.info(
        `Fetching validators info from ${validatorIds[0]} to ${validatorIds[validatorIds.length - 1]}`
      );
      const validatorsInfo = await getValidatorsInfo(slotNumber, validatorIds);

      const updateData = validatorsInfo.map((validatorInfo) => ({
        id: parseInt(validatorInfo.index),
        withdrawalAddress:
          validatorInfo.validator.withdrawal_credentials.startsWith("0x01")
            ? "0x" + validatorInfo.validator.withdrawal_credentials.slice(-40)
            : null,
        status: validatorInfo.status,
      }));

      const updateQuery = Prisma.sql`
          UPDATE "Validator"
          SET 
            "withdrawalAddress" = CASE
              ${Prisma.join(
                updateData.map(
                  (u) =>
                    Prisma.sql`WHEN id = ${u.id} THEN ${u.withdrawalAddress}`
                ),
                " "
              )}
            END,
            "status" = CASE
              ${Prisma.join(
                updateData.map(
                  (u) => Prisma.sql`WHEN id = ${u.id} THEN ${u.status}`
                ),
                " "
              )}
            END
          WHERE id IN (${Prisma.join(updateData.map((u) => u.id))});
        `;

      await prisma.$executeRaw(updateQuery);
    } catch (error) {
      logger.error(`Error fetching validators info`, error);
    }
  }
}
