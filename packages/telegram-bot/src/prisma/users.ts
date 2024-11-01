import { getPrisma } from "@/src/config/prisma.js";
import { AppError } from "@/src/utils/errors/AppError.js";

const prisma = getPrisma();

export function getUser_db(userId: number) {
  return prisma.user
    .findUniqueOrThrow({
      where: { id: userId },
    })
    .catch((error) => {
      throw new AppError("Error getting user", "BD_ERROR", error);
    });
}

export function getUserFull_db(userId: number) {
  return prisma.user
    .findUnique({
      where: { id: userId },
      include: {
        withdrawalAddresses: true,
        validators: true,
      },
    })
    .catch((error) => {
      throw new AppError("Error getting user", "BD_ERROR", error);
    });
}

export function getUsers_db() {
  return prisma.user
    .findMany({
      select: {
        id: true,
        messageId: true,
      },
    })
    .catch((error) => {
      throw new AppError("Error getting users", "BD_ERROR", error);
    });
}

export function countUsers_db() {
  return prisma.user.count().catch((error) => {
    throw new AppError("Error counting users", "BD_ERROR", error);
  });
}

export function getUserWithWithdrawalAddresses_db(userId: number) {
  return prisma.user
    .findFirstOrThrow({
      where: {
        id: userId,
      },
      include: {
        withdrawalAddresses: true,
      },
    })
    .catch((error) => {
      throw new AppError(
        "Error getting user with withdrawal addresses",
        "BD_ERROR",
        error
      );
    });
}

export async function deleteUser_db(userId: number) {
  try {
    const deleteUser = prisma.user.delete({ where: { id: userId } });
    const deleteWithdrawalAddress = prisma.withdrawalAddress.deleteMany({
      where: { users: { none: {} } },
    });
    const deleteValidators = prisma.validator.deleteMany({
      where: { users: { none: {} } },
    });

    const res = await prisma.$transaction([
      deleteUser,
      deleteWithdrawalAddress,
      deleteValidators,
    ]);

    return res;
  } catch (error) {
    throw new AppError("Error deleting user", "BD_ERROR", error);
  }
}

type UpdateArgs = Parameters<typeof prisma.user.update>;
export function updateUserById_db(userId: number, data: UpdateArgs[0]["data"]) {
  return prisma.user
    .update({
      where: {
        id: userId,
      },
      data,
    })
    .catch((error) => {
      throw new AppError("Error updating user", "BD_ERROR", error);
    });
}

type UpsertArgs = Parameters<typeof prisma.user.upsert>;
export function upsertUser_db(
  userId: number,
  update: UpsertArgs[0]["update"],
  create: UpsertArgs[0]["create"]
) {
  return prisma.user
    .upsert({
      where: { id: userId },
      update,
      create,
    })
    .catch((error) => {
      throw new AppError("Error upserting user", "BD_ERROR", error);
    });
}

export async function getAllUsers_db() {
  return prisma.user.findMany().catch((error) => {
    throw new AppError("Error getting all users", "BD_ERROR", error);
  });
}

export function updateUserMessageId_db(userId: number, messageId: number) {
  return prisma.user
    .update({
      where: {
        id: userId,
      },
      data: {
        messageId: messageId,
      },
    })
    .catch((error) => {
      throw new AppError("Error updating user message id", "BD_ERROR", error);
    });
}
