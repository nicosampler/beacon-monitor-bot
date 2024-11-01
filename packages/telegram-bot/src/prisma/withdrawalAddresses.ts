import { getPrisma } from "@/src/config/prisma.js";
import { AppError } from "@/src/utils/errors/AppError.js";

const prisma = getPrisma();

export function getWithdrawalAddresses_db(userId: number) {
  return prisma.withdrawalAddress
    .findMany({
      where: {
        users: {
          some: {
            userId: userId
          }
        }
      }
    })
    .catch((error) => {
      throw new AppError(
        "Error getting withdrawal addresses",
        "BD_ERROR",
        error
      );
    });
}
