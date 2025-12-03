import { getPrisma } from '@/src/lib/prisma.js';

export type UserValidatorsResult = {
  id: string;
  username: string;
  inactiveOnMissedAttestations: number;
  validators: {
    withdrawalAddress: string;
    validators: {
      id: number;
      status: number | null;
    }[];
  }[];
};

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
   * Connect validators and their withdrawal addresses to a user.
   *
   * This version assumes that the caller already has the withdrawal addresses
   * for the provided validator IDs, so we do not re-query the Validator table.
   */
  connectValidatorsAndWithdrawalAddresses: async (
    loginId: string,
    validatorIds: number[],
    withdrawalAddresses: string[],
  ) => {
    const prisma = getPrisma();

    // Normalize and deduplicate withdrawal addresses
    const normalizedAddresses = Array.from(
      new Set(
        withdrawalAddresses
          .filter((addr): addr is string => !!addr)
          .map((addr) => addr.toLowerCase()),
      ),
    );

    return prisma.user.update({
      where: { loginId },
      data: {
        validators: {
          connect: validatorIds.map((id) => ({ id })),
        },
        withdrawalAddresses: {
          connectOrCreate: normalizedAddresses.map((address) => ({
            where: { address },
            create: { address },
          })),
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

  /**
   * Disconnect validators and clean up withdrawal addresses from a user
   * This method ensures that if all validators for a withdrawal address are removed,
   * the withdrawal address is also removed from the user
   */
  disconnectValidatorsAndWithdrawalAddresses: async (loginId: string, validatorIds: number[]) => {
    const prisma = getPrisma();

    return prisma.$transaction(async (tx) => {
      // Get the user's current withdrawal addresses
      const user = await tx.user.findUnique({
        where: { loginId },
        include: {
          withdrawalAddresses: true,
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Disconnect the validators
      await tx.user.update({
        where: { loginId },
        data: {
          validators: {
            disconnect: validatorIds.map((id) => ({ id })),
          },
        },
      });

      // For each withdrawal address of the user, check if they still have any validators with that address
      for (const withdrawalAddress of user.withdrawalAddresses) {
        const remainingValidatorsWithAddress = await tx.validator.count({
          where: {
            withdrawalAddress: withdrawalAddress.address,
            users: {
              some: {
                loginId: loginId,
              },
            },
          },
        });

        // If no validators remain with this withdrawal address, disconnect it from the user
        if (remainingValidatorsWithAddress === 0) {
          await tx.user.update({
            where: { loginId },
            data: {
              withdrawalAddresses: {
                disconnect: { address: withdrawalAddress.address },
              },
            },
          });
        }
      }
    });
  },

  /**
   * Disconnect withdrawal addresses and their associated validators from a user
   * This method removes all validators associated with the provided withdrawal addresses
   */
  disconnectWithdrawalAddressesAndValidators: async (loginId: string, addresses: string[]) => {
    const prisma = getPrisma();

    return prisma.$transaction(async (tx) => {
      // Find all validators with the provided withdrawal addresses that belong to this user
      const validatorsToRemove = await tx.validator.findMany({
        where: {
          withdrawalAddress: {
            in: addresses,
          },
          users: {
            some: {
              loginId: loginId,
            },
          },
        },
        select: {
          id: true,
          withdrawalAddress: true,
        },
      });

      const validatorIdsToRemove = validatorsToRemove.map((v) => v.id);

      // Disconnect the validators
      await tx.user.update({
        where: { loginId },
        data: {
          validators: {
            disconnect: validatorIdsToRemove.map((id) => ({ id })),
          },
        },
      });

      // Disconnect the withdrawal addresses
      await tx.user.update({
        where: { loginId },
        data: {
          withdrawalAddresses: {
            disconnect: addresses.map((address) => ({ address: address.toLowerCase() })),
          },
        },
      });
    });
  },

  /**
   * Get user validators with detailed information grouped by withdrawal address
   */
  getUserValidators: async (loginId: string): Promise<UserValidatorsResult | undefined> => {
    const prisma = getPrisma();

    const res = await prisma.$queryRaw<UserValidatorsResult[]>`
      WITH grouped_validators AS (
        SELECT 
          v."withdrawalAddress",
          jsonb_agg(
            jsonb_build_object(
              'id', v.id,
              'status', v.status
            )
          ) as validators
        FROM "User" u
        JOIN "_UserToValidator" uv ON u.id = uv."A"
        JOIN "Validator" v ON v.id = uv."B"
        WHERE u."loginId" = ${loginId}
        GROUP BY v."withdrawalAddress"
      )
      SELECT 
        u.id as id,
        u.username,
        u."inactiveOnMissedAttestations",
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'withdrawalAddress', gv."withdrawalAddress",
              'validators', gv.validators
            )
          ),
          '[]'::jsonb
        ) as validators
      FROM "User" u
      LEFT JOIN grouped_validators gv ON true
      WHERE u."loginId" = ${loginId}
      GROUP BY u.id, u.username, u."inactiveOnMissedAttestations"
    `;

    return res[0];
  },

  /**
   * Get validator IDs for a user
   */
  getValidatorIds: async (loginId: string): Promise<number[] | null> => {
    const prisma = getPrisma();

    const user = await prisma.user.findUnique({
      where: { loginId },
      include: {
        validators: true,
      },
    });

    if (!user) {
      return null;
    }

    return user.validators.map((validator) => validator.id);
  },

  /**
   * Get withdrawal addresses for a user
   */
  getWithdrawalAddresses: async (loginId: string): Promise<string[] | null> => {
    const prisma = getPrisma();

    const user = await prisma.user.findUnique({
      where: { loginId },
      include: {
        withdrawalAddresses: true,
      },
    });

    if (!user) {
      return null;
    }

    return user.withdrawalAddresses.map((wa) => wa.address);
  },

  /**
   * Set or clear the lidoOperatorId field for a user.
   * If operatorId is null, the field will be cleared.
   */
  updateLidoOperatorId: async (loginId: string, operatorId: string | null) => {
    const prisma = getPrisma();
    return prisma.user.update({
      where: { loginId },
      data: {
        lidoOperatorId: operatorId,
      },
    });
  },

  /**
   * Clear the stored Telegram stats message id so a new message is created next time.
   */
  clearMessageIdByLoginId: async (loginId: string) => {
    const prisma = getPrisma();

    return prisma.user.update({
      where: { loginId },
      data: {
        messageId: null,
      },
    });
  },
};
