import { Request, Response } from 'express';

import { getPrisma } from '@/src/lib/prisma.js';
import {
  getCurrentSyncCommittee,
  updateSyncCommitteeNotified,
} from '@/src/services/syncCommittee.js';
import {
  CurrentSyncCommitteeResponse,
  UpdateSyncCommitteeNotifiedRequest,
} from '@/src/routes/types.js';

export async function getCurrentSyncCommitteeController(
  _: Request,
  res: Response<CurrentSyncCommitteeResponse>,
): Promise<Response<CurrentSyncCommitteeResponse>> {
  try {
    const syncCommittee = await getCurrentSyncCommittee();
    return res.json(syncCommittee);
  } catch (error) {
    console.error('Error fetching current sync committee:', error);
    return res.status(500).json({ error: 'Internal server error' } as any);
  }
}

export async function updateSyncCommitteeNotifiedController(
  req: Request<{}, {}, UpdateSyncCommitteeNotifiedRequest>,
  res: Response,
): Promise<Response> {
  try {
    const { fromEpoch, toEpoch } = req.body;

    if (fromEpoch === undefined || toEpoch === undefined) {
      return res.status(400).json({ error: 'fromEpoch and toEpoch are required' });
    }

    await updateSyncCommitteeNotified(fromEpoch, toEpoch);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error updating sync committee notified status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
