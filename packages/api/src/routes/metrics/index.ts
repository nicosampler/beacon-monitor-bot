import { Router } from 'express';

import {
  getMetricsController,
  getWithdrawalAddressStatsController,
} from '@/src/routes/metrics/controller.js';

export const metricsRouter = Router();

metricsRouter.get('/overview', getMetricsController);
metricsRouter.get('/withdrawal-address-coverage', getWithdrawalAddressStatsController);
