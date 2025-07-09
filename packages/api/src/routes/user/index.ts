import { Router } from 'express';

import { validateRequest } from '@/src/lib/middleware/validate.js';
import { addValidatorIdsController } from '@/src/routes/user/addValidatorIdsController.js';
import { addWithdrawalAddressesController } from '@/src/routes/user/addWithdrawalAddressesController.js';
import { getUserValidatorsInfoController } from '@/src/routes/user/getUserInfoController.js';
import { getActiveUsersValidatorsController } from '@/src/routes/user/getUserValidatorCountsController.js';
import { removeValidatorIdsController } from '@/src/routes/user/removeValidatorIdsController.js';
import { removeWithdrawalAddressesController } from '@/src/routes/user/removeWithdrawalAddressesController.js';
import {
  userParamsSchema,
  withdrawalAddressesSchema,
  validatorIdsSchema,
} from '@/src/routes/user/schema.js';

export const userRouter = Router();

userRouter.get('/active-users-validators', getActiveUsersValidatorsController);

userRouter.get(
  '/:loginId/validatorsInfo',
  validateRequest({ params: userParamsSchema }),
  getUserValidatorsInfoController,
);

userRouter.post(
  '/:loginId/withdrawal-addresses',
  validateRequest({ params: userParamsSchema, body: withdrawalAddressesSchema }),
  addWithdrawalAddressesController,
);

userRouter.delete(
  '/:loginId/withdrawal-addresses',
  validateRequest({ params: userParamsSchema, body: withdrawalAddressesSchema }),
  removeWithdrawalAddressesController,
);

userRouter.post(
  '/:loginId/validators',
  validateRequest({ params: userParamsSchema, body: validatorIdsSchema }),
  addValidatorIdsController,
);

userRouter.delete(
  '/:loginId/validators',
  validateRequest({ params: userParamsSchema, body: validatorIdsSchema }),
  removeValidatorIdsController,
);
