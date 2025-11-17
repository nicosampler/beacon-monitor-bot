import { Request, Response } from 'express';

import { userService } from '@/src/services/prisma/user.js';
import { validatorService } from '@/src/services/prisma/validators.js';

export const addLidoOperatorValidatorsController = async (req: Request, res: Response) => {
  try {
    const { loginId } = req.params;
    const { operatorId, pubkeys: enteredPubkeys } = req.body as {
      operatorId: number;
      pubkeys: string[];
    };

    if (!Array.isArray(enteredPubkeys) || enteredPubkeys.length === 0) {
      return res.status(400).json({ error: 'Pubkeys must be a non-empty array' });
    }

    const userRecord = await userService.findByLoginIdWithValidators(loginId);

    if (!userRecord) {
      return res.status(404).json({ error: 'User not found' });
    }

    const operatorIdAsString = operatorId.toString();

    if (userRecord.lidoOperatorId && userRecord.lidoOperatorId !== operatorIdAsString) {
      return res.status(400).json({
        error: 'User already has a different Lido operator id',
        currentOperatorId: userRecord.lidoOperatorId,
      });
    }

    const validatorsMatchedByPubkeys = await validatorService.findByPubkeys(enteredPubkeys);

    const matchedPubkeysLowercaseSet = new Set(
      validatorsMatchedByPubkeys
        .map((validator) => validator.pubkey)
        .filter((pubkey): pubkey is string => pubkey != null)
        .map((pubkey) => pubkey.toLowerCase()),
    );

    const userMissingPubKeys = enteredPubkeys.filter(
      (pubkey) => !matchedPubkeysLowercaseSet.has(pubkey.toLowerCase()),
    );

    const existingUserValidatorIds = new Set(
      userRecord.validators.map((validator) => validator.id),
    );
    const enteredValidatorIds = validatorsMatchedByPubkeys.map((validator) => validator.id);
    const newValidatorIdsForUser = enteredValidatorIds.filter(
      (validatorId) => !existingUserValidatorIds.has(validatorId),
    );

    if (newValidatorIdsForUser.length > 0) {
      await userService.connectValidatorsAndWithdrawalAddresses(loginId, newValidatorIdsForUser);

      // If the user does not yet have a Lido operator configured, set it now.
      if (!userRecord.lidoOperatorId) {
        await userService.updateLidoOperatorId(loginId, operatorIdAsString);
      }
    }

    return res.json({
      operatorId,
      matchedValidators: validatorsMatchedByPubkeys.length,
      newValidatorsConnected: newValidatorIdsForUser.length,
      userMissingPubKeys,
    });
  } catch (error) {
    console.error('Error adding Lido operator validators:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
