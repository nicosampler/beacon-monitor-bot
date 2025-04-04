import { Request, Response } from 'express';

import { cache } from '@/src/lib/cache.js';
import { UserValidatorsInfo, ValidatorStatusesByWithdrawal } from '@/src/routes/types.js';
import { UserParams } from '@/src/routes/user/schema.js';
import { getMissedAttestations_db } from '@/src/services/prisma/getMissedAttestations.js';
import { getUserValidators_db } from '@/src/services/prisma/getUserValidators.js';
import { getSlotInfo } from '@/src/utils/getSlotInfo.js';
import { getValidatorStatuses } from '@/src/utils/getValidatorStatuses.js';

export async function getUserValidatorsInfoController(
  req: Request<UserParams>,
  res: Response,
): Promise<Response> {
  const cacheKey = `userInfo:${req.params.loginId}`;
  console.log(`[Cache] Processing request for cacheKey: ${cacheKey}`);

  const cachedData = cache.get<UserValidatorsInfo>(cacheKey);
  if (cachedData) {
    console.log(`[Cache] Cache hit for key: ${cacheKey}`);
    return res.json(cachedData);
  }

  const startTime = Date.now();

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

    const response: UserValidatorsInfo = {
      username: user.username,
      validatorsByWithdrawal,
      missedAttestations,
    };

    const executionTime = Date.now() - startTime;
    cache.set(cacheKey, response);

    console.log(`[Cache] Query execution time: ${executionTime}ms for key: ${cacheKey}`);
    return res.json(response);
  } catch (error) {
    console.error('Error fetching user info:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
