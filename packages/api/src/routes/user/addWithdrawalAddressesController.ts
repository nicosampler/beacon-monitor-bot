import { Validator } from '@prisma/client';
import { Request, Response } from 'express';
import { isAddress } from 'viem';

import { userService } from '@/src/services/prisma/user.js';
import { validatorService } from '@/src/services/prisma/validators.js';

export const addWithdrawalAddressesController = async (req: Request, res: Response) => {
  try {
    const { loginId } = req.params;
    let { addresses } = req.body;

    // non empty array
    if (!Array.isArray(addresses) || addresses.length === 0) {
      return res.status(400).json({ error: 'Addresses must be a non-empty array' });
    }

    // every address is a valid address
    if (!addresses.every((address) => isAddress(address))) {
      return res.status(400).json({ error: 'Invalid withdrawal addresses' });
    }

    // remove duplicates
    addresses = [...new Set(addresses)];

    // Find the user
    const user = await userService.findByLoginIdWithValidators(loginId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Find all validators with matching withdrawal addresses in the database
    const validators = await validatorService.findByWithdrawalAddresses(addresses);
    if (validators.length === 0) {
      return res.status(404).json({
        error: 'No validators found with the provided withdrawal addresses in the database',
        requestedAddresses: addresses,
      });
    }

    // Check if all requested addresses were found
    const foundAddresses = validators.map((v: Validator) => v.withdrawalAddress).filter(Boolean);
    const notFoundAddresses = addresses.filter(
      (addr: string) => !foundAddresses.includes(addr.toLowerCase()),
    );

    if (notFoundAddresses.length > 0) {
      return res.status(404).json({
        error: 'Some withdrawal addresses were not found in the database',
        found: validators.length,
        requested: addresses.length,
        notFoundAddresses,
      });
    }

    // Connect the user to all found validators and their withdrawal addresses
    await userService.connectValidatorsAndWithdrawalAddresses(
      loginId,
      validators.map((v: Validator) => v.id),
      addresses,
    );

    return res.json({
      newValidators: validators.map((v: Validator) => v.id),
      count: validators.length,
    });
  } catch (error) {
    console.error('Error adding withdrawal addresses:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
