import { z } from '../openapi/zod';

export const adminSessionsQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional().default(''),
    page: z.coerce.number().int().min(1).optional().default(1),
    page_size: z.coerce.number().int().min(1).max(100).optional().default(20),
  })
  .openapi('AdminSessionsQuery');
export type AdminSessionsQuery = z.infer<typeof adminSessionsQuerySchema>;

export const adminRevokeUserSessionsSchema = z
  .object({
    user_id: z.string().min(1, 'Thiếu user_id'),
  })
  .openapi('AdminRevokeUserSessionsRequest');
export type AdminRevokeUserSessionsInput = z.infer<typeof adminRevokeUserSessionsSchema>;
