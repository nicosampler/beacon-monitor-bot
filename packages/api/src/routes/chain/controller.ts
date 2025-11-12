import { Request, Response } from 'express';

import { getChainStatistics } from '@/src/services/chain.js';

export const getChainStatisticsController = async (_req: Request, res: Response) => {
  try {
    const statistics = await getChainStatistics();
    res.json(statistics);
  } catch (error) {
    console.error('Error fetching chain statistics:', error);
    res.status(500).json({ error: 'Failed to fetch chain statistics' });
  }
};
