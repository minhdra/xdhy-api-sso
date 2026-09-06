import { z } from '../openapi/zod';

export const loginSchema = z
  .object({
    username: z.string().min(1, 'Tài khoản là bắt buộc'),
    password: z.string().min(1, 'Mật khẩu là bắt buộc'),
    remember: z.boolean().optional().default(false),
  })
  .openapi('LoginRequest');
export type LoginInput = z.infer<typeof loginSchema>;

// `app` (tuỳ chọn): app_key của app đang gọi /me để tự bảo vệ - xem
// AppService.canAccessApp. Không truyền = chỉ lấy danh tính, không gate app
// nào (đúng cách sso-web tự gọi cho chính nó).
export const meQuerySchema = z
  .object({
    app: z.string().min(1).optional(),
  })
  .openapi('MeQuery');
export type MeQuery = z.infer<typeof meQuerySchema>;

export const forgotPasswordSchema = z
  .object({
    email: z.string().email('Email không hợp lệ'),
  })
  .openapi('ForgotPasswordRequest');
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordConfirmSchema = z
  .object({
    token: z.string().min(1, 'Thiếu token'),
    newPassword: z.string().min(6, 'Mật khẩu mới phải có ít nhất 6 ký tự'),
  })
  .openapi('ResetPasswordConfirmRequest');
export type ResetPasswordConfirmInput = z.infer<typeof resetPasswordConfirmSchema>;
