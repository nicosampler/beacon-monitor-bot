import { Request, Response } from 'express';

import { cache } from '@/src/lib/cache.js';
import { getMissedAttestations_db } from '@/src/prisma/getMissedAttestations.js';
import { getUserValidators_db } from '@/src/prisma/getUserValidators.js';
import { UserInfo, ValidatorStatusesByWithdrawal } from '@/src/routes/types.js';
import { UserParams } from '@/src/routes/user/schema.js';
import { getSlotInfo } from '@/src/utils/getSlotInfo.js';
import { getValidatorStatuses } from '@/src/utils/getValidatorStatuses.js';

export async function getUserInfoController(
  req: Request<UserParams>,
  res: Response,
): Promise<Response> {
  const cacheKey = `userInfo:${req.params.loginId}`;

  const cachedData = cache.get<UserInfo>(cacheKey);
  if (cachedData) {
    return res.json(cachedData);
  }

  try {
    const user = await getUserValidators_db(req.params.loginId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const slotInfo = await getSlotInfo();
    const missedAttestations = await getMissedAttestations_db(
      Number(user.id),
      slotInfo.maxSafeSlotToQuery,
    );

    // Process validators by withdrawal address
    const validatorsByWithdrawal: ValidatorStatusesByWithdrawal = {};
    for (const group of user.validators) {
      const address = group.withdrawalAddress;

      validatorsByWithdrawal[address] = getValidatorStatuses(
        group.validators,
        user.inactiveOnMissedAttestations,
        missedAttestations,
        slotInfo.maxSafeSlotToQuery,
      );
    }

    const response: UserInfo = {
      username: user.username,
      validatorsByWithdrawal,
      missedAttestations,
    };

    cache.set(cacheKey, response);
    return res.json(response);
  } catch (error) {
    console.error('Error fetching user info:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
