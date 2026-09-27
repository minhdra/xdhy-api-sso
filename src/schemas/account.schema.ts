import { z } from '../openapi/zod';

import { MOBILE_PHONE, optionalNumber, optionalString, personName } from './common.schema';

// Chỉ các field user tự sửa được. Các field quản trị (branch/department/
// position/type/first_middle_last_name) do accountService tự nạp lại từ DB
// rồi merge - client không gửi (xem plan §1c/§1d).
export const updateProfileSchema = z
  .object({
    full_name: personName(),
    email: z.string().email('Email không hợp lệ'),
    phone_number: optionalString().pipe(
      z.union([z.literal(''), z.string().regex(MOBILE_PHONE, 'Số điện thoại phải có 10 số và bắt đầu bằng 0')]),
    ),
    // 0 = chưa xác định, 1 = nam, 2 = nữ (theo dữ liệu build_management).
    gender: optionalNumber(),
    // ISO date ('1990-01-31') hoặc rỗng. Postgres tự cast sang date.
    date_of_birth: z.preprocess(
      (v) => (v === null || v === undefined || v === '' ? null : v),
      z.string().nullable(),
    ),
  })
  .openapi('UpdateProfileRequest');
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1, 'Nhập mật khẩu hiện tại'),
    newPassword: z.string().min(6, 'Mật khẩu mới phải có ít nhất 6 ký tự'),
  })
  .openapi('ChangePasswordRequest');
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const revokeSessionSchema = z
  .object({
    session_id: z.string().min(1, 'Thiếu session_id'),
  })
  .openapi('RevokeSessionRequest');
export type RevokeSessionInput = z.infer<typeof revokeSessionSchema>;
