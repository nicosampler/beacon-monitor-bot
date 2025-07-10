import { Validator } from '@prisma/client';
import { Request, Response } from 'express';

import { userService } from '@/src/services/prisma/user.js';
import { validatorService } from '@/src/services/prisma/validators.js';

export const removeWithdrawalAddressesController = async (req: Request, res: Response) => {
  try {
    const { loginId } = req.params;
    const { addresses } = req.body;

    if (!Array.isArray(addresses) || addresses.length === 0) {
      return res.status(400).json({ error: 'Addresses must be a non-empty array' });
    }

    // Find the user
    const user = await userService.findByLoginIdWithValidators(loginId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Find all validators with matching withdrawal addresses
    const validators = await validatorService.findByWithdrawalAddresses(addresses);
    if (validators.length === 0) {
      return res
        .status(404)
        .json({ error: 'No validators found with the provided withdrawal addresses' });
    }

    // Disconnect the user from withdrawal addresses and their associated validators
    await userService.disconnectWithdrawalAddressesAndValidators(loginId, addresses);

    return res.json({
      message: `Successfully removed ${validators.length} validators from user`,
      validators: validators.map((v: Validator) => v.id),
    });
  } catch (error) {
    console.error('Error removing withdrawal addresses:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
