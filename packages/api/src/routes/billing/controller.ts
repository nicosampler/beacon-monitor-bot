import { Request, Response } from 'express';

import { getPrisma } from '../../lib/prisma.js';
import { calculatePricingDetails } from '../../services/pricing.js';
import { NodeBillingResponse, ErrorResponse } from '../types.js';

export async function billingController(
  _: Request,
  res: Response<NodeBillingResponse | ErrorResponse>,
) {
  const prisma = getPrisma();

  try {
    // Get users with validator count using a subquery
    const usersWithValidatorCount = await prisma.$queryRaw<
      Array<{ id: bigint; username: string; validator_count: number }>
    >`
      SELECT 
        u.id,
        u.username,
        COUNT(v.id)::integer as validator_count
      FROM "User" u
      LEFT JOIN "_UserToValidator" uv ON u.id = uv."A"
      LEFT JOIN "Validator" v ON v.id = uv."B" AND v.status IN (2, 3)
      GROUP BY u.id, u.username
      ORDER BY COUNT(v.id) DESC
    `;

    let totalMonthly = 0;

    // Calculate billing for each user
    const users = await Promise.all(
      usersWithValidatorCount.map(async (user) => {
        const validatorCount = user.validator_count;
        const pricingDetails = await calculatePricingDetails(validatorCount);
        const monthlyPrice = pricingDetails?.monthlyPrice ?? 0;

        // Add to total
        totalMonthly += monthlyPrice;

        return {
          userId: Number(user.id),
          username: user.username,
          validatorCount,
          monthlyPrice,
        };
      }),
    );

    const response: NodeBillingResponse = {
      users,
      totalMonthly,
      timestamp: new Date().toISOString(),
    };

    return res.json(response);
  } catch (error) {
    console.error('Error calculating billing:', error);
    const response: ErrorResponse = {
      error: 'Failed to calculate billing',
      timestamp: new Date().toISOString(),
    };
    return res.status(500).json(response);
  }
}
