import { Request, Response } from 'express';

import { UserParams } from '@/src/routes/user/schema.js';
import { userService } from '@/src/services/prisma/user.js';

export async function getValidatorIdsController(
  req: Request<UserParams>,
  res: Response,
): Promise<Response> {
  try {
    const validatorIds = await userService.getValidatorIds(req.params.loginId);

    if (!validatorIds) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ validatorIds });
  } catch (error) {
    console.error('Error fetching validator IDs:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
