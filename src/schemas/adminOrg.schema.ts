import { z } from '../openapi/zod';

import {
  birthDate,
  MOBILE_PHONE,
  optionalLandline,
  optionalNumber,
  optionalString,
  personName,
} from './common.schema';

// Quản trị người dùng / chi nhánh / phòng ban / chức vụ / nhóm quyền (chuyển
// từ api-core sang SSO 26/09/2026). Người thao tác luôn lấy từ req.userId -
// KHÔNG nhận created_by_user_id/lu_user_id từ body như api-core cũ.

// pageIndex bắt đầu từ 1 (proc Search* tính row_number BETWEEN (index-1)*size+1).
const pagination = {
  pageIndex: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(500).default(20),
  search_content: optionalString(),
};

// ===== Người dùng =====
const userFields = {
  position_id: z.number().int(),
  branch_id: z.number().int(),
  department_id: z.number().int(),
  type: optionalString(),
  full_name: personName(),
  gender: optionalNumber(),
  date_of_birth: birthDate(),
  email: z.string().trim().email('Email không hợp lệ').max(150),
  // Bắt buộc: app chat từ chối user không có số điện thoại (và form cũ build-web cũng bắt buộc).
  phone_number: z.string().trim().regex(MOBILE_PHONE, 'Số điện thoại phải có 10 số và bắt đầu bằng 0'),
  description: optionalString().pipe(z.string().max(250, 'Ghi chú tối đa 250 ký tự')),
};

export const searchUserSchema = z
  .object({ ...pagination, branch_id: optionalNumber(), department_id: optionalNumber() })
  .openapi('AdminSearchUserRequest');
export type SearchUserInput = z.infer<typeof searchUserSchema>;

export const createUserSchema = z
  .object({
    ...userFields,
    user_name: z
      .string()
      .trim()
      .min(3, 'Tên đăng nhập tối thiểu 3 ký tự')
      .max(50, 'Tên đăng nhập tối đa 50 ký tự')
      .regex(/^[a-z0-9._-]+$/, 'Tên đăng nhập chỉ chữ thường không dấu, số và . _ -'),
    // Bỏ trống = mật khẩu mặc định (orgService DEFAULT_NEW_PASSWORD) - form SSO không còn ô nhập.
    password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự').max(100).optional(),
    role_ids: z.array(z.string().min(1)).optional(),
    // Trùng tên đăng nhập với tài khoản ĐÃ XOÁ: lần gửi đầu bỏ trống -> 409 kèm
    // thông tin tài khoản đó; admin chọn rồi gửi lại "restore" (khôi phục, giữ
    // user_id + lịch sử) hoặc "new" (tạo tài khoản mới, user_id mới).
    deleted_user_action: z.enum(['restore', 'new']).optional(),
  })
  .openapi('AdminCreateUserRequest');
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({ user_id: z.string().min(1), ...userFields, role_ids: z.array(z.string().min(1)).optional() })
  .openapi('AdminUpdateUserRequest');
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userIdsSchema = z
  .object({ user_ids: z.array(z.string().min(1)).min(1, 'Chưa chọn người dùng') })
  .openapi('AdminUserIdsRequest');
export type UserIdsInput = z.infer<typeof userIdsSchema>;

export const lockUserSchema = z
  .object({ user_id: z.string().min(1), online_flag: z.number().int() })
  .openapi('AdminLockUserRequest');
export type LockUserInput = z.infer<typeof lockUserSchema>;

export const userIdSchema = z.object({ user_id: z.string().min(1) }).openapi('AdminUserIdRequest');
export type UserIdInput = z.infer<typeof userIdSchema>;

export const userIdParamSchema = z.object({ user_id: z.string().min(1) });

export const setUserRolesSchema = z
  .object({ role_ids: z.array(z.string().min(1)) })
  .openapi('AdminSetUserRolesRequest');
export type SetUserRolesInput = z.infer<typeof setUserRolesSchema>;

// ===== Chi nhánh / phòng ban =====
const contactFields = {
  phone: optionalLandline(),
  fax: optionalLandline(),
  address: optionalString().pipe(z.string().max(250, 'Địa chỉ tối đa 250 ký tự')),
};

export const searchBranchSchema = z.object(pagination).openapi('AdminSearchBranchRequest');
export const upsertBranchSchema = z
  .object({
    branch_id: z.number().int().nullable().optional(),
    branch_name: z.string().trim().min(1, 'Tên chi nhánh là bắt buộc').max(250),
    ...contactFields,
  })
  .openapi('AdminUpsertBranchRequest');
export type UpsertBranchInput = z.infer<typeof upsertBranchSchema>;

export const searchDepartmentSchema = z.object(pagination).openapi('AdminSearchDepartmentRequest');
export const upsertDepartmentSchema = z
  .object({
    department_id: z.number().int().nullable().optional(),
    department_name: z.string().trim().min(1, 'Tên phòng ban là bắt buộc').max(250),
    ...contactFields,
  })
  .openapi('AdminUpsertDepartmentRequest');
export type UpsertDepartmentInput = z.infer<typeof upsertDepartmentSchema>;

// ===== Chức vụ =====
export const searchPositionSchema = z.object(pagination).openapi('AdminSearchPositionRequest');
export const upsertPositionSchema = z
  .object({
    position_id: z.number().int().nullable().optional(),
    position_name: z.string().trim().min(1, 'Tên chức vụ là bắt buộc').max(250),
    description: optionalString(),
  })
  .openapi('AdminUpsertPositionRequest');
export type UpsertPositionInput = z.infer<typeof upsertPositionSchema>;

export const intIdsSchema = z
  .object({ ids: z.array(z.number().int()).min(1, 'Chưa chọn bản ghi') })
  .openapi('AdminIntIdsRequest');
export type IntIdsInput = z.infer<typeof intIdsSchema>;

// ===== Nhóm quyền =====
export const searchRoleSchema = z.object(pagination).openapi('AdminSearchRoleRequest');
export const upsertRoleSchema = z
  .object({
    role_id: z.string().nullable().optional(),
    role_code: z
      .string()
      .trim()
      .min(1, 'Mã nhóm quyền là bắt buộc')
      .max(50)
      .regex(/^[A-Za-z0-9_-]+$/, 'Mã nhóm quyền chỉ gồm chữ, số, "_" và "-"'),
    role_name: z.string().trim().min(1, 'Tên nhóm quyền là bắt buộc').max(250),
    description: optionalString(),
  })
  .openapi('AdminUpsertRoleRequest');
export type UpsertRoleInput = z.infer<typeof upsertRoleSchema>;

export const roleIdsSchema = z
  .object({ role_ids: z.array(z.string().min(1)).min(1, 'Chưa chọn nhóm quyền') })
  .openapi('AdminRoleIdsRequest');
export type RoleIdsInput = z.infer<typeof roleIdsSchema>;

// ===== Đồng bộ =====
export const syncTargetSchema = z
  .object({ target: z.enum(['finance', 'task', 'chat', 'meeting']).nullable().optional() })
  .openapi('AdminSyncTargetRequest');
export type SyncTargetInput = z.infer<typeof syncTargetSchema>;

export const syncResyncSchema = z
  .object({ target: z.enum(['finance', 'task', 'chat', 'meeting']) })
  .openapi('AdminSyncResyncRequest');
export type SyncResyncInput = z.infer<typeof syncResyncSchema>;
