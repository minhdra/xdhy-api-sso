"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncResyncSchema = exports.syncTargetSchema = exports.roleIdsSchema = exports.upsertRoleSchema = exports.searchRoleSchema = exports.intIdsSchema = exports.upsertPositionSchema = exports.searchPositionSchema = exports.upsertDepartmentSchema = exports.searchDepartmentSchema = exports.upsertBranchSchema = exports.searchBranchSchema = exports.setUserRolesSchema = exports.userIdParamSchema = exports.userIdSchema = exports.lockUserSchema = exports.userIdsSchema = exports.updateUserSchema = exports.createUserSchema = exports.searchUserSchema = void 0;
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
    full_name: zod_1.z.string().trim().min(1, 'Họ tên là bắt buộc').max(60, 'Họ tên tối đa 60 ký tự'),
    gender: (0, common_schema_1.optionalNumber)(),
    date_of_birth: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày sinh dạng YYYY-MM-DD').nullable().optional(),
    email: zod_1.z.string().trim().email('Email không hợp lệ').max(150),
    // Bắt buộc: app chat từ chối user không có số điện thoại (và form cũ build-web cũng bắt buộc).
    phone_number: zod_1.z.string().trim().min(1, 'Số điện thoại là bắt buộc').max(20),
    description: (0, common_schema_1.optionalString)(),
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
        .min(1, 'Tên đăng nhập là bắt buộc')
        .max(150)
        .regex(/^[A-Za-z0-9._@-]+$/, 'Tên đăng nhập không được có dấu cách/ký tự đặc biệt'),
    password: zod_1.z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự').max(100),
    role_ids: zod_1.z.array(zod_1.z.string().min(1)).optional(),
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
    phone: (0, common_schema_1.optionalString)(),
    fax: (0, common_schema_1.optionalString)(),
    address: (0, common_schema_1.optionalString)(),
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
exports.syncTargetSchema = zod_1.z
    .object({ target: zod_1.z.enum(['finance', 'task', 'chat', 'meeting']).nullable().optional() })
    .openapi('AdminSyncTargetRequest');
exports.syncResyncSchema = zod_1.z
    .object({ target: zod_1.z.enum(['finance', 'task', 'chat', 'meeting']) })
    .openapi('AdminSyncResyncRequest');
