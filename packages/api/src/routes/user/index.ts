import { Router } from 'express';

import { validateRequest } from '@/src/lib/middleware/validate.js';
import { addLidoOperatorValidatorsController } from '@/src/routes/user/addLidoOperatorValidatorsController.js';
import { addValidatorIdsController } from '@/src/routes/user/addValidatorIdsController.js';
import { addWithdrawalAddressesController } from '@/src/routes/user/addWithdrawalAddressesController.js';
import { getUserValidatorsInfoController } from '@/src/routes/user/getUserInfoController.js';
import { getActiveUsersValidatorsController } from '@/src/routes/user/getUserValidatorCountsController.js';
import { getValidatorIdsController } from '@/src/routes/user/getValidatorIdsController.js';
import { getWithdrawalAddressesController } from '@/src/routes/user/getWithdrawalAddressesController.js';
import { removeLidoOperatorValidatorsController } from '@/src/routes/user/removeLidoOperatorValidatorsController.js';
import { removeValidatorIdsController } from '@/src/routes/user/removeValidatorIdsController.js';
import { removeWithdrawalAddressesController } from '@/src/routes/user/removeWithdrawalAddressesController.js';
import {
  userParamsSchema,
  withdrawalAddressesSchema,
  validatorIdsSchema,
  lidoOperatorValidatorsSchema,
  removeLidoOperatorValidatorsSchema,
} from '@/src/routes/user/schema.js';

export const userRouter = Router();

userRouter.get('/active-users-validators', getActiveUsersValidatorsController);

userRouter.get(
  '/:loginId/validatorsInfo',
  validateRequest({ params: userParamsSchema }),
  getUserValidatorsInfoController,
);

userRouter.get(
  '/:loginId/withdrawal-addresses',
  validateRequest({ params: userParamsSchema }),
  getWithdrawalAddressesController,
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

userRouter.get(
  '/:loginId/validator-ids',
  validateRequest({ params: userParamsSchema }),
  getValidatorIdsController,
);

userRouter.post(
  '/:loginId/validator-ids',
  validateRequest({ params: userParamsSchema, body: validatorIdsSchema }),
  addValidatorIdsController,
);

userRouter.delete(
  '/:loginId/validator-ids',
  validateRequest({ params: userParamsSchema, body: validatorIdsSchema }),
  removeValidatorIdsController,
);

userRouter.post(
  '/:loginId/lido-operator-validators',
  validateRequest({ params: userParamsSchema, body: lidoOperatorValidatorsSchema }),
  addLidoOperatorValidatorsController,
);

userRouter.post(
  '/:loginId/remove-lido-operator-validators',
  validateRequest({ params: userParamsSchema, body: removeLidoOperatorValidatorsSchema }),
  removeLidoOperatorValidatorsController,
);
