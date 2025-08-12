import { Router } from 'express';

import { getCurrentSyncCommitteeController } from './controller.js';
import { updateSyncCommitteeNotifiedController } from './controller.js';

export const syncCommitteeRouter = Router();

syncCommitteeRouter.get('/current', getCurrentSyncCommitteeController);
syncCommitteeRouter.put('/notified', updateSyncCommitteeNotifiedController);
