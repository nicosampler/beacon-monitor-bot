import { Request, Response } from 'express';

import { cache } from '@/src/lib/cache.js';
import { userService } from '@/src/services/prisma/user.js';
import { validatorService } from '@/src/services/prisma/validators.js';

export const addLidoOperatorValidatorsController = async (req: Request, res: Response) => {
  try {
    const controllerStartTime = Date.now();
    console.log('[CSM Lido] Starting addLidoOperatorValidatorsController');

    const { loginId } = req.params;
    const { operatorId, pubkeys: enteredPubkeys } = req.body as {
      operatorId: number;
      pubkeys: string[];
    };

    if (!Array.isArray(enteredPubkeys) || enteredPubkeys.length === 0) {
      return res.status(400).json({ error: 'Pubkeys must be a non-empty array' });
    }

    const userRecordStart = Date.now();
    const userRecord = await userService.findByLoginIdWithValidators(loginId);
    console.log(
      `[CSM Lido] userService.findByLoginIdWithValidators took ${
        Date.now() - userRecordStart
      }ms for loginId=${loginId}`,
    );

    if (!userRecord) {
      return res.status(404).json({ error: 'User not found' });
    }

    const operatorIdAsString = operatorId.toString();

    if (userRecord.lidoOperatorId && userRecord.lidoOperatorId !== operatorIdAsString) {
      return res.status(400).json({
        error: 'User already has a different CSM Lido id',
        currentOperatorId: userRecord.lidoOperatorId,
      });
    }

    const validatorsMatchedStart = Date.now();
    const validatorsMatchedByPubkeys = await validatorService.findByPubkeys(enteredPubkeys);
    console.log(
      `[CSM Lido] validatorService.findByPubkeys took ${
        Date.now() - validatorsMatchedStart
      }ms for ${enteredPubkeys.length} pubkeys`,
    );

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

    // Extract withdrawal addresses only for the new validators
    const validatorsById = new Map(
      validatorsMatchedByPubkeys.map((validator) => [validator.id, validator]),
    );
    const withdrawalAddressesForNewValidators = newValidatorIdsForUser
      .map((id) => validatorsById.get(id)?.withdrawalAddress)
      .filter((addr): addr is string => !!addr);

    if (newValidatorIdsForUser.length > 0) {
      const connectValidatorsStart = Date.now();
      await userService.connectValidatorsAndWithdrawalAddresses(
        loginId,
        newValidatorIdsForUser,
        withdrawalAddressesForNewValidators,
      );
      console.log(
        `[CSM Lido] userService.connectValidatorsAndWithdrawalAddresses took ${
          Date.now() - connectValidatorsStart
        }ms for loginId=${loginId} and ${newValidatorIdsForUser.length} new validators`,
      );

      // If the user does not yet have a CSM Lido configured, set it now.
      if (!userRecord.lidoOperatorId) {
        const updateOperatorIdStart = Date.now();
        await userService.updateLidoOperatorId(loginId, operatorIdAsString);
        console.log(
          `[CSM Lido] userService.updateLidoOperatorId took ${
            Date.now() - updateOperatorIdStart
          }ms for loginId=${loginId} and operatorId=${operatorIdAsString}`,
        );
      }

      // Clear Telegram stats message id so that a new message is created next time.
      await userService.clearMessageIdByLoginId(loginId);
    }

    // Invalidate cached user info so the next fetch reflects the new validators.
    const cacheKey = `userInfo:${loginId}`;
    cache.del(cacheKey);
    console.log(`[Cache] Invalidated key after Lido CSM update: ${cacheKey}`);

    const response = {
      operatorId,
      matchedValidators: validatorsMatchedByPubkeys.length,
      newValidatorsConnected: newValidatorIdsForUser.length,
      userMissingPubKeys,
    };

    console.log(
      `[CSM Lido] addLidoOperatorValidatorsController completed in ${
        Date.now() - controllerStartTime
      }ms for loginId=${loginId} and operatorId=${operatorIdAsString}`,
    );

    return res.json(response);
  } catch (error) {
    console.error('Error adding CSM Lido validators:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
