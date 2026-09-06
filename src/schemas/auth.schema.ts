import { z } from '../openapi/zod';

export const loginSchema = z
  .object({
    username: z.string().min(1, 'Tài khoản là bắt buộc'),
    password: z.string().min(1, 'Mật khẩu là bắt buộc'),
    remember: z.boolean().optional().default(false),
  })
  .openapi('LoginRequest');
export type LoginInput = z.infer<typeof loginSchema>;

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
