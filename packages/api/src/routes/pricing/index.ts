import { Router } from 'express';

import { getPricingController, getSpecificPricingController } from './controller.js';

export const pricingRouter = Router();

// Get all pricing tiers
pricingRouter.get('/', getPricingController);

// Get specific pricing for a number of validators
pricingRouter.get('/calculate', getSpecificPricingController);
