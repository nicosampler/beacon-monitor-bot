import { getPrisma } from "@/src/config/prisma.js";
import { AppError } from "@/src/utils/errors/AppError.js";

const prisma = getPrisma();

export function getFeeRewardAddresses_db(userId?: number) {
  return prisma.feeRewardAddress
    .findMany({
      where: {
        users: {
          some: {
            id: userId,
            hasBlockedBot: false,
          },
        },
      },
      include: {
        users: true, // Include all related users
      },
    })
    .catch((error) => {
      throw new AppError(
        "Error getting fee reward addresses",
        "BD_ERROR",
        error
      );
    });
}
