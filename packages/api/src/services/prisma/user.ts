import { getPrisma } from '@/src/lib/prisma.js';

export const userService = {
  /**
   * Find a user by their loginId
   */
  findByLoginId: async (loginId: string) => {
    const prisma = getPrisma();
    return prisma.user.findUnique({
      where: { loginId },
    });
  },

  /**
   * Find a user by their loginId including their validators
   */
  findByLoginIdWithValidators: async (loginId: string) => {
    const prisma = getPrisma();
    return prisma.user.findUnique({
      where: { loginId },
      include: {
        validators: true,
      },
    });
  },

  /**
   * Connect validators to a user
   */
  connectValidators: async (loginId: string, validatorIds: number[]) => {
    const prisma = getPrisma();
    return prisma.user.update({
      where: { loginId },
      data: {
        validators: {
          connect: validatorIds.map((id) => ({ id })),
        },
      },
    });
  },

  /**
   * Disconnect validators from a user
   * If an empty array is provided, all validators will be disconnected
   */
  disconnectValidators: async (loginId: string, validatorIds: number[]) => {
    const prisma = getPrisma();
    return prisma.user.update({
      where: { loginId },
      data: {
        validators:
          validatorIds.length === 0
            ? { set: [] } // Disconnect all validators
            : { disconnect: validatorIds.map((id) => ({ id })) }, // Disconnect specific validators
      },
    });
  },
};
