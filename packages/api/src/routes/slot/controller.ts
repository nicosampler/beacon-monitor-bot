import { Request, Response } from 'express';

import { SlotInfoResponse } from '@/src/routes/types.js';
import { getSlotInfo } from '@/src/utils/getSlotInfo.js';

export async function getSlotInfoController(
  _: Request,
  res: Response<SlotInfoResponse>,
): Promise<Response<SlotInfoResponse>> {
  try {
    const slotInfo = await getSlotInfo();
    return res.json(slotInfo);
  } catch (error) {
    console.error('Error fetching slot info:', error);
    return res.status(500).json({ error: 'Internal server error' } as any);
  }
}
