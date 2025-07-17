import { Request, Response } from 'express';

import { getMetrics, getWithdrawalAddressStats } from '@/src/services/metrics.js';

export async function getMetricsController(_req: Request, res: Response) {
  try {
    const metrics = await getMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch metrics',
    });
  }
}

export async function getWithdrawalAddressStatsController(_req: Request, res: Response) {
  try {
    const stats = await getWithdrawalAddressStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching withdrawal address stats:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch withdrawal address stats',
    });
  }
}
