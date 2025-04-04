import { Router } from 'express';

import { validateRequest } from '@/src/lib/middleware/validate.js';
import { getUserValidatorsInfoController } from '@/src/routes/user/getUserInfoController.js';
import { getActiveUsersValidatorsController } from '@/src/routes/user/getUserValidatorCountsController.js';
import { userParamsSchema } from '@/src/routes/user/schema.js';

export const userRouter = Router();

userRouter.get('/active-users-validators', getActiveUsersValidatorsController);

userRouter.get(
  '/:loginId/validatorsInfo',
  validateRequest({ params: userParamsSchema }),
  getUserValidatorsInfoController,
);
