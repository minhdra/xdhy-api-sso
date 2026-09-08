import { z } from '../openapi/zod';

// Route nội bộ (server-to-server) - KHÔNG lên Swagger công khai, không dùng
// defineRoute()/registry. Chỉ validate body qua middlewares/validate.

export const filterAppAccessSchema = z.object({
  app_key: z
    .string()
    .min(1, 'app_key là bắt buộc')
    .regex(/^[a-z0-9-]+$/, 'app_key chỉ gồm chữ thường, số và dấu gạch ngang'),
  // Danh sách rỗng hợp lệ - trả về allowed_user_ids rỗng.
  user_ids: z.array(z.string().min(1)).default([]),
});
export type FilterAppAccessInput = z.infer<typeof filterAppAccessSchema>;
