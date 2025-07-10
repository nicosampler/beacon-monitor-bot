import { Validator } from '@prisma/client';
import { Request, Response } from 'express';

import { userService } from '@/src/services/prisma/user.js';
import { validatorService } from '@/src/services/prisma/validators.js';

export const addValidatorIdsController = async (req: Request, res: Response) => {
  try {
    const { loginId } = req.params;
    const { validatorIds } = req.body;

    if (!Array.isArray(validatorIds) || validatorIds.length === 0) {
      return res.status(400).json({ error: 'Validator IDs must be a non-empty array' });
    }

    // Find the user
    const user = await userService.findByLoginId(loginId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify all validators exist in the database
    const validators = await validatorService.findByIds(validatorIds);
    if (validators.length !== validatorIds.length) {
      const foundIds = validators.map((v: Validator) => v.id);
      const notFoundIds = validatorIds.filter((id: number) => !foundIds.includes(id));

      return res.status(404).json({
        error: 'Some validators were not found in the database',
        found: validators.length,
        requested: validatorIds.length,
        notFoundIds,
      });
    }

    // Connect the user to all validators and their withdrawal addresses
    await userService.connectValidatorsAndWithdrawalAddresses(loginId, validatorIds);

    return res.json({
      message: `Successfully associated ${validators.length} validators with user`,
      validators: validators.map((v: Validator) => v.id),
    });
  } catch (error) {
    console.error('Error adding validator IDs:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
