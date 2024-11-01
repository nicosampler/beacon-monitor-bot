import { getPrisma } from "@/src/config/prisma.js";
import { AppError } from "@/src/utils/errors/AppError.js";

const prisma = getPrisma();

export function getWithdrawalAddresses_db(userId?: number) {
  return prisma.withdrawalAddress
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
      throw new AppError(
        "Error getting withdrawal addresses",
        "BD_ERROR",
        error
      );
    });
}
