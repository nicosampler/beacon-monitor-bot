import { getPrisma } from "@/src/config/prisma.js";
import { AppError } from "@/src/utils/errors/AppError.js";

const prisma = getPrisma();

export function getDBValidators(userId?: number) {
  return prisma.validator
    .findMany({
      where: userId
        ? {
            users: {
              some: {
                id: userId,
              },
            },
          }
        : undefined,
      include: {
        users: true,
      },
    })
    .catch((error) => {
      throw new AppError("Error getting validators", "BD_ERROR", error);
    });
}

export function countAllValidatorsLoaded() {
  return prisma.validator.count().catch((error) => {
    throw new AppError("Error counting validators", "BD_ERROR", error);
  });
}
