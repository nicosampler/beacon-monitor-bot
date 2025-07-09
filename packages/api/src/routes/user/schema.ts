import { isAddress } from 'viem';
import { z } from 'zod';

export const userParamsSchema = z.object({
  loginId: z.string(),
});

export const withdrawalAddressesSchema = z.object({
  addresses: z
    .array(
      z
        .string()
        .min(1)
        .refine((address) => isAddress(address), {
          message: 'Invalid Ethereum address format',
        }),
    )
    .min(1, 'At least one withdrawal address is required'),
});

export const validatorIdsSchema = z.object({
  validatorIds: z
    .array(z.number().int().positive())
    .min(1, 'At least one validator ID is required'),
});

export type UserParams = z.infer<typeof userParamsSchema>;
