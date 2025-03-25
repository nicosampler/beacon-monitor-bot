import { Request, Response } from 'express';

import { getActiveUsersValidators } from '@/src/services/prisma/getActiveUsersValidators.js';

export async function getActiveUsersValidatorsController(
  _: Request,
  res: Response,
): Promise<Response> {
  try {
    const result = await getActiveUsersValidators();
    return res.json(result);
  } catch (error) {
    console.error('Error fetching validator counts:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
