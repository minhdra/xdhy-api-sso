"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncResyncSchema = exports.syncHistorySchema = exports.syncTargetSchema = exports.roleIdsSchema = exports.upsertRoleSchema = exports.searchRoleSchema = exports.intIdsSchema = exports.upsertPositionSchema = exports.searchPositionSchema = exports.upsertDepartmentSchema = exports.searchDepartmentSchema = exports.upsertBranchSchema = exports.searchBranchSchema = exports.setUserRolesSchema = exports.userIdParamSchema = exports.userIdSchema = exports.lockUserSchema = exports.userIdsSchema = exports.updateUserSchema = exports.createUserSchema = exports.searchUserSchema = void 0;
const zod_1 = require("../openapi/zod");
const common_schema_1 = require("./common.schema");
// Quản trị người dùng / chi nhánh / phòng ban / chức vụ / nhóm quyền (chuyển
// từ api-core sang SSO 26/09/2026). Người thao tác luôn lấy từ req.userId -
// KHÔNG nhận created_by_user_id/lu_user_id từ body như api-core cũ.
// pageIndex bắt đầu từ 1 (proc Search* tính row_number BETWEEN (index-1)*size+1).
const pagination = {
    pageIndex: zod_1.z.number().int().min(1).default(1),
    pageSize: zod_1.z.number().int().min(1).max(500).default(20),
    search_content: (0, common_schema_1.optionalString)(),
};
// ===== Người dùng =====
const userFields = {
    position_id: zod_1.z.number().int(),
    branch_id: zod_1.z.number().int(),
    department_id: zod_1.z.number().int(),
    type: (0, common_schema_1.optionalString)(),
    full_name: (0, common_schema_1.personName)(),
    gender: (0, common_schema_1.optionalNumber)(),
    date_of_birth: (0, common_schema_1.birthDate)(),
    email: zod_1.z.string().trim().email('Email không hợp lệ').max(150),
    // Bắt buộc: app chat từ chối user không có số điện thoại (và form cũ build-web cũng bắt buộc).
    phone_number: zod_1.z.string().trim().regex(common_schema_1.MOBILE_PHONE, 'Số điện thoại phải có 10 số và bắt đầu bằng 0'),
    description: (0, common_schema_1.optionalString)().pipe(zod_1.z.string().max(250, 'Ghi chú tối đa 250 ký tự')),
};
exports.searchUserSchema = zod_1.z
    .object({ ...pagination, branch_id: (0, common_schema_1.optionalNumber)(), department_id: (0, common_schema_1.optionalNumber)() })
    .openapi('AdminSearchUserRequest');
exports.createUserSchema = zod_1.z
    .object({
    ...userFields,
    user_name: zod_1.z
        .string()
        .trim()
        .min(3, 'Tên đăng nhập tối thiểu 3 ký tự')
        .max(50, 'Tên đăng nhập tối đa 50 ký tự')
        .regex(/^[a-z0-9._-]+$/, 'Tên đăng nhập chỉ chữ thường không dấu, số và . _ -'),
    // Bỏ trống = mật khẩu mặc định (orgService DEFAULT_NEW_PASSWORD) - form SSO không còn ô nhập.
    password: zod_1.z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự').max(100).optional(),
    role_ids: zod_1.z.array(zod_1.z.string().min(1)).optional(),
    // Trùng tên đăng nhập với tài khoản ĐÃ XOÁ: lần gửi đầu bỏ trống -> 409 kèm
    // thông tin tài khoản đó; admin chọn rồi gửi lại "restore" (khôi phục, giữ
    // user_id + lịch sử) hoặc "new" (tạo tài khoản mới, user_id mới).
    deleted_user_action: zod_1.z.enum(['restore', 'new']).optional(),
})
    .openapi('AdminCreateUserRequest');
exports.updateUserSchema = zod_1.z
    .object({ user_id: zod_1.z.string().min(1), ...userFields, role_ids: zod_1.z.array(zod_1.z.string().min(1)).optional() })
    .openapi('AdminUpdateUserRequest');
exports.userIdsSchema = zod_1.z
    .object({ user_ids: zod_1.z.array(zod_1.z.string().min(1)).min(1, 'Chưa chọn người dùng') })
    .openapi('AdminUserIdsRequest');
exports.lockUserSchema = zod_1.z
    .object({ user_id: zod_1.z.string().min(1), online_flag: zod_1.z.number().int() })
    .openapi('AdminLockUserRequest');
exports.userIdSchema = zod_1.z.object({ user_id: zod_1.z.string().min(1) }).openapi('AdminUserIdRequest');
exports.userIdParamSchema = zod_1.z.object({ user_id: zod_1.z.string().min(1) });
exports.setUserRolesSchema = zod_1.z
    .object({ role_ids: zod_1.z.array(zod_1.z.string().min(1)) })
    .openapi('AdminSetUserRolesRequest');
// ===== Chi nhánh / phòng ban =====
const contactFields = {
    phone: (0, common_schema_1.optionalLandline)(),
    fax: (0, common_schema_1.optionalLandline)(),
    address: (0, common_schema_1.optionalString)().pipe(zod_1.z.string().max(250, 'Địa chỉ tối đa 250 ký tự')),
};
exports.searchBranchSchema = zod_1.z.object(pagination).openapi('AdminSearchBranchRequest');
exports.upsertBranchSchema = zod_1.z
    .object({
    branch_id: zod_1.z.number().int().nullable().optional(),
    branch_name: zod_1.z.string().trim().min(1, 'Tên chi nhánh là bắt buộc').max(250),
    ...contactFields,
})
    .openapi('AdminUpsertBranchRequest');
exports.searchDepartmentSchema = zod_1.z.object(pagination).openapi('AdminSearchDepartmentRequest');
exports.upsertDepartmentSchema = zod_1.z
    .object({
    department_id: zod_1.z.number().int().nullable().optional(),
    department_name: zod_1.z.string().trim().min(1, 'Tên phòng ban là bắt buộc').max(250),
    ...contactFields,
})
    .openapi('AdminUpsertDepartmentRequest');
// ===== Chức vụ =====
exports.searchPositionSchema = zod_1.z.object(pagination).openapi('AdminSearchPositionRequest');
exports.upsertPositionSchema = zod_1.z
    .object({
    position_id: zod_1.z.number().int().nullable().optional(),
    position_name: zod_1.z.string().trim().min(1, 'Tên chức vụ là bắt buộc').max(250),
    description: (0, common_schema_1.optionalString)(),
})
    .openapi('AdminUpsertPositionRequest');
exports.intIdsSchema = zod_1.z
    .object({ ids: zod_1.z.array(zod_1.z.number().int()).min(1, 'Chưa chọn bản ghi') })
    .openapi('AdminIntIdsRequest');
// ===== Nhóm quyền =====
exports.searchRoleSchema = zod_1.z.object(pagination).openapi('AdminSearchRoleRequest');
exports.upsertRoleSchema = zod_1.z
    .object({
    role_id: zod_1.z.string().nullable().optional(),
    role_code: zod_1.z
        .string()
        .trim()
        .min(1, 'Mã nhóm quyền là bắt buộc')
        .max(50)
        .regex(/^[A-Za-z0-9_-]+$/, 'Mã nhóm quyền chỉ gồm chữ, số, "_" và "-"'),
    role_name: zod_1.z.string().trim().min(1, 'Tên nhóm quyền là bắt buộc').max(250),
    description: (0, common_schema_1.optionalString)(),
})
    .openapi('AdminUpsertRoleRequest');
exports.roleIdsSchema = zod_1.z
    .object({ role_ids: zod_1.z.array(zod_1.z.string().min(1)).min(1, 'Chưa chọn nhóm quyền') })
    .openapi('AdminRoleIdsRequest');
// ===== Đồng bộ =====
const SYNC_TARGET = zod_1.z.enum(['finance', 'task', 'chat', 'meeting']);
// Thử lại / bỏ qua: theo danh sách id (dòng trong nhật ký) hoặc theo đích
// (null = mọi đích).
exports.syncTargetSchema = zod_1.z
    .object({
    target: SYNC_TARGET.nullable().optional(),
    ids: zod_1.z.array(zod_1.z.string().regex(/^\d+$/)).min(1).max(500).nullable().optional(),
})
    .openapi('AdminSyncTargetRequest');
exports.syncHistorySchema = zod_1.z
    .object({
    target: SYNC_TARGET.nullable().optional(),
    status: zod_1.z.enum(['pending', 'done', 'failed', 'skipped']).nullable().optional(),
    entity: zod_1.z.enum(['user', 'user_roles', 'branch', 'department', 'position', 'role']).nullable().optional(),
    search: zod_1.z.string().trim().max(100).nullable().optional(),
    pageIndex: zod_1.z.number().int().min(1).default(1),
    pageSize: zod_1.z.number().int().min(1).max(200).default(20),
})
    .openapi('AdminSyncHistoryRequest');
exports.syncResyncSchema = zod_1.z
    .object({ target: SYNC_TARGET })
    .openapi('AdminSyncResyncRequest');
