import { Request, Response } from 'express';

import { getPrisma } from '../../lib/prisma.js';
import { HealthResponse, ErrorResponse } from '../types.js';

export async function healthCheck(_: Request, res: Response<HealthResponse | ErrorResponse>) {
  const prisma = getPrisma();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const response: HealthResponse = {
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    console.error(error);
    const response: ErrorResponse = {
      error: 'Database connection failed',
      timestamp: new Date().toISOString(),
    };
    res.status(503).json(response);
  }
}
