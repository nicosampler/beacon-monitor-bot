import { Router } from 'express';

import { getStatsController } from '@/src/routes/stats/getStatsController.js';

export const statsRouter = Router();

statsRouter.get('/indexer', getStatsController);
