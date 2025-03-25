import { Request, Response } from 'express';

import { getStats } from '@/src/services/prisma/getStats.js';

export async function getStatsController(_: Request, res: Response): Promise<Response> {
  try {
    const stats = await getStats();
    return res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
