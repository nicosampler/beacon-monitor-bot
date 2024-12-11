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

export function getUsers_db() {
  return prisma.user
    .findMany({
      select: {
        id: true,
        messageId: true,
        username: true,
      },
    })
    .catch((error) => {
      throw new AppError("Error getting users", "BD_ERROR", error);
    });
}

export function getAllUserIds_db(userId?: number) {
  return prisma.user.findMany({
    where: userId ? { id: userId } : undefined,
    select: {
      id: true,
      userId: true,
      username: true,
      messageId: true,
    },
  });
}

export function getFullUsers_db(userId?: number) {
  return prisma.user.findMany({
    where: userId ? { id: userId } : undefined,
    select: {
      id: true,
      userId: true,
      chatId: true,
      messageId: true,
      username: true,
      inactiveOnMissedAttestations: true,
      inactiveNotif: true,
      performanceNotif: true,
      performanceThreshold: true,
      validators: true,
      withdrawalAddresses: true,
    },
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
    // First disconnect all relationships
    const disconnectRelations = prisma.user.update({
      where: { id: userId },
      data: {
        withdrawalAddresses: {
          set: [], // This disconnects all relationships without deleting the addresses
        },
        feeRewardAddresses: {
          set: [], // This disconnects all relationships without deleting the addresses
        },
        validators: {
          set: [], // This disconnects all relationships without deleting the validators
        },
      },
    });

    // Then delete the user
    const deleteUser = prisma.user.delete({
      where: { id: userId },
    });

    // Execute both operations in a transaction
    const res = await prisma.$transaction([disconnectRelations, deleteUser]);

    return res;
  } catch (error) {
    throw new AppError("Error deleting user", "BD_ERROR", error);
  }
}

export async function clearAlertDelay_db(userId: number) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      performanceNotif: null,
      inactiveNotif: null,
    },
  });
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

export function deleteAddress(userId: number, address: string) {
  return prisma.user
    .update({
      where: { id: userId },
      data: {
        withdrawalAddresses: {
          disconnect: {
            address: address,
          },
        },
        feeRewardAddresses: {
          disconnect: {
            address: address,
          },
        },
      },
    })
    .catch((error) => {
      throw new AppError("Error removing address from user", "BD_ERROR", error);
    });
}
