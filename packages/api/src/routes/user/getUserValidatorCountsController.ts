import { Request, Response } from 'express';

import { getPrisma } from '@/src/lib/prisma.js';
import { ActiveUsersValidators } from '@/src/routes/types.js';
import { VALIDATOR_STATUS } from '@/src/utils/beacon.js';

export async function getActiveUsersValidatorsController(
  _: Request,
  res: Response,
): Promise<Response> {
  const prisma = getPrisma();

  try {
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

    return res.json({
      users,
      summary: {
        totalUsers,
        totalValidators,
      },
    });
  } catch (error) {
    console.error('Error fetching validator counts:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
