import { Router } from 'express';

import { getChainStatisticsController } from './controller.js';

export const chainRouter = Router();

chainRouter.get('/statistics', getChainStatisticsController);


