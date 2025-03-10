import { z } from "zod";

export const userParamsSchema = z.object({
  loginId: z.string(),
});

export type UserParams = z.infer<typeof userParamsSchema>;
