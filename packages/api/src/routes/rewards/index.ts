import { Router } from 'express';

import { validateRequest } from '@/src/lib/middleware/validate.js';
import { getRewardsSummaryController } from '@/src/routes/rewards/controller.js';
import { rewardsQuerySchema } from '@/src/routes/rewards/schema.js';

export const rewardsRouter = Router();

rewardsRouter.get(
  '/summary',
  validateRequest({ query: rewardsQuerySchema }),
  getRewardsSummaryController,
);
