import { Request, Response } from 'express';

import { userService } from '@/src/services/prisma/user.js';
import { validatorService } from '@/src/services/prisma/validators.js';

export const removeLidoOperatorValidatorsController = async (req: Request, res: Response) => {
  try {
    const { loginId } = req.params;
    const { pubkeys } = req.body as {
      pubkeys: string[];
    };

    if (!Array.isArray(pubkeys) || pubkeys.length === 0) {
      return res.status(400).json({ error: 'Pubkeys must be a non-empty array' });
    }

    const userRecord = await userService.findByLoginIdWithValidators(loginId);

    if (!userRecord) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userLidoOperatorId = userRecord.lidoOperatorId;

    if (!userLidoOperatorId) {
      return res.status(400).json({ error: 'User does not have a Lido CSM Id configured' });
    }

    const operatorIdAsString = userLidoOperatorId.toString();

    const validatorsMatchedByPubkeys = await validatorService.findByPubkeys(pubkeys);

    const matchedPubkeysLowercaseSet = new Set(
      validatorsMatchedByPubkeys
        .map((validator) => validator.pubkey)
        .filter((pubkey): pubkey is string => pubkey != null)
        .map((pubkey) => pubkey.toLowerCase()),
    );

    const userMissingPubKeys = pubkeys.filter(
      (pubkey) => !matchedPubkeysLowercaseSet.has(pubkey.toLowerCase()),
    );

    const userValidatorIds = new Set(userRecord.validators.map((validator) => validator.id));
    const validatorIdsToRemove = validatorsMatchedByPubkeys
      .map((validator) => validator.id)
      .filter((validatorId) => userValidatorIds.has(validatorId));

    if (validatorIdsToRemove.length > 0) {
      await userService.disconnectValidatorsAndWithdrawalAddresses(loginId, validatorIdsToRemove);
    }

    return res.json({
      operatorId: operatorIdAsString,
      matchedValidators: validatorsMatchedByPubkeys.length,
      validatorsDisconnected: validatorIdsToRemove.length,
      userMissingPubKeys,
    });
  } catch (error) {
    console.error('Error removing Lido CSM validators:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
