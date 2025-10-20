import { isAddress } from 'viem';
import { z } from 'zod';

// Custom validation function for single address
const validateAddress = (address: string) => {
  return isAddress(address);
};

// Custom validation function for comma-separated addresses
const validateAddresses = (addresses: string) => {
  const addressList = addresses.split(',').map((addr) => addr.trim());
  return addressList.every((addr) => isAddress(addr));
};

export const rewardsQuerySchema = z.object({
  withdrawal_addresses: z.union([
    z.string().refine(validateAddress, 'Invalid withdrawal address format'),
    z.string().refine(validateAddresses, 'Invalid withdrawal addresses format (comma-separated)'),
  ]),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'),
  fee_reward_addresses: z
    .union([
      z.string().refine(validateAddress, 'Invalid fee reward address format'),
      z.string().refine(validateAddresses, 'Invalid fee reward addresses format (comma-separated)'),
    ])
    .optional(),
});

export type RewardsQueryParams = z.infer<typeof rewardsQuerySchema>;
