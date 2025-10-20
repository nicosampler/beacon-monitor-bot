import { Request, Response } from 'express';

import { RewardsQueryParams } from '@/src/routes/rewards/schema.js';
import { RewardsSummaryResponse } from '@/src/routes/types.js';
import { getRewardsSummary } from '@/src/services/prisma/getRewardsSummary.js';

export async function getRewardsSummaryController(
  req: Request<object, RewardsSummaryResponse, object, RewardsQueryParams>,
  res: Response,
): Promise<Response> {
  try {
    const { withdrawal_addresses, month, fee_reward_addresses } = req.query;

    // Parse withdrawal addresses (comma-separated string to array)
    const withdrawalAddresses = withdrawal_addresses.split(',').map((addr) => addr.trim());

    // Parse fee reward addresses if provided (comma-separated string to array)
    const feeRewardAddresses = fee_reward_addresses
      ? fee_reward_addresses.split(',').map((addr) => addr.trim())
      : undefined;

    const data = await getRewardsSummary(withdrawalAddresses, month, feeRewardAddresses);

    const response: RewardsSummaryResponse = {
      withdrawal_addresses: withdrawalAddresses,
      fee_reward_addresses: feeRewardAddresses,
      month,
      validators: data.validators,
      monthly_totals: data.monthly_totals,
      generated_at: new Date().toISOString(),
    };

    return res.json(response);
  } catch (error) {
    console.error('Error fetching rewards summary:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
