import { Validator } from '@prisma/client';
import { Request, Response } from 'express';

import { userService } from '@/src/services/prisma/user.js';
import { validatorService } from '@/src/services/prisma/validators.js';

export const removeValidatorIdsController = async (req: Request, res: Response) => {
  try {
    const { loginId } = req.params;
    const { validatorIds } = req.body;

    if (!Array.isArray(validatorIds) || validatorIds.length === 0) {
      return res.status(400).json({ error: 'Validator IDs must be a non-empty array' });
    }

    // Find the user
    const user = await userService.findByLoginIdWithValidators(loginId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify all validators exist
    const validators = await validatorService.findByIds(validatorIds);
    if (validators.length !== validatorIds.length) {
      return res.status(404).json({
        error: 'Some validators were not found',
        found: validators.length,
        requested: validatorIds.length,
      });
    }

    // Disconnect the user from validators and clean up withdrawal addresses
    await userService.disconnectValidatorsAndWithdrawalAddresses(loginId, validatorIds);

    return res.json({
      message: `Successfully removed ${validators.length} validators from user`,
      validators: validators.map((v: Validator) => v.id),
    });
  } catch (error) {
    console.error('Error removing validator IDs:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
