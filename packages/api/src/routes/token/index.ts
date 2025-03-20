import { Router } from 'express';

import { getTokenPriceController } from './controller.js';

export const tokenRouter = Router();

tokenRouter.get('/price', getTokenPriceController);
