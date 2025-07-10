import { Request, Response } from 'express';

import { UserParams } from '@/src/routes/user/schema.js';
import { userService } from '@/src/services/prisma/user.js';

export async function getWithdrawalAddressesController(
  req: Request<UserParams>,
  res: Response,
): Promise<Response> {
  try {
    const withdrawalAddresses = await userService.getWithdrawalAddresses(req.params.loginId);

    if (!withdrawalAddresses) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ addresses: withdrawalAddresses });
  } catch (error) {
    console.error('Error fetching withdrawal addresses:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
