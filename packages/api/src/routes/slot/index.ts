import { Router } from 'express';

import { getSlotInfoController } from './controller.js';

export const slotRouter = Router();

slotRouter.get('/info', getSlotInfoController);
