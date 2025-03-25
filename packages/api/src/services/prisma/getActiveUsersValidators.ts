import { getPrisma } from '@/src/lib/prisma.js';
import { ActiveUsersValidators } from '@/src/routes/types.js';
import { VALIDATOR_STATUS } from '@/src/utils/beacon.js';

export async function getActiveUsersValidators(): Promise<{
  users: ActiveUsersValidators[];
  summary: {
    totalUsers: number;
    totalValidators: number;
  };
}> {
  const prisma = getPrisma();

  const results = await prisma.user.findMany({
    where: {
      hasBlockedBot: false,
    },
    select: {
      username: true,
      _count: {
        select: {
          validators: {
            where: {
              OR: [
                { status: VALIDATOR_STATUS.active_ongoing },
                { status: VALIDATOR_STATUS.pending_queued },
                { status: VALIDATOR_STATUS.pending_initialized },
              ],
            },
          },
        },
      },
    },
    orderBy: {
      username: 'asc',
    },
  });

  const users: ActiveUsersValidators[] = results.map((result) => ({
    username: result.username,
    activeValidators: result._count.validators,
  }));

  const totalUsers = users.length;
  const totalValidators = users.reduce((acc, curr) => acc + curr.activeValidators, 0);

  return {
    users,
    summary: {
      totalUsers,
      totalValidators,
    },
  };
}
