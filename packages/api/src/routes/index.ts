import { Router } from 'express';

import { billingRouter } from './billing/index.js';
import { healthRouter } from './health/index.js';
import { pricingRouter } from './pricing/index.js';
import { slotRouter } from './slot/index.js';
import { statsRouter } from './stats/index.js';
import { tokenRouter } from './token/index.js';
import { userRouter } from './user/index.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/user', userRouter);
apiRouter.use('/token', tokenRouter);
apiRouter.use('/billing', billingRouter);
apiRouter.use('/stats', statsRouter);
apiRouter.use('/pricing', pricingRouter);
apiRouter.use('/slot', slotRouter);
