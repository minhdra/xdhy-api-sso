"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tsyringe_1 = require("tsyringe");
const adminOrgController_1 = require("../controllers/adminOrgController");
const auth_1 = require("../middlewares/auth");
const requireAdmin_1 = require("../middlewares/requireAdmin");
const defineRoute_1 = require("../openapi/defineRoute");
const adminOrg_schema_1 = require("../schemas/adminOrg.schema");
// Quản trị người dùng / chi nhánh / phòng ban / chức vụ / nhóm quyền + trạng
// thái đồng bộ sang app (26/09/2026 - chuyển từ api-core). Chỉ admin (role sa).
// Mọi thay đổi ghi a_sync_outbox -> worker đồng bộ sang finance/task/chat/meeting.
const adminOrgRouter = (0, express_1.Router)();
const c = tsyringe_1.container.resolve(adminOrgController_1.AdminOrgController);
const ok = { 200: { description: 'OK' }, 400: { description: 'Dữ liệu không hợp lệ' }, 403: { description: 'Không phải quản trị viên' } };
adminOrgRouter.use('/admin/org', auth_1.requireAuth, requireAdmin_1.requireAdmin);
function route(method, path, tag, summary, handler, schema) {
    const expressPath = `/admin/org${path}`;
    const openapiPath = expressPath.replace(/:([a-z_]+)/g, '{$1}');
    adminOrgRouter[method](expressPath, ...(0, defineRoute_1.defineRoute)({ method, path: openapiPath, tags: [tag], summary, schema, responses: ok }), handler);
}
const USERS = 'Admin - Người dùng';
route('post', '/users/search', USERS, 'Tìm kiếm người dùng (phân trang)', c.searchUsers, { body: adminOrg_schema_1.searchUserSchema });
route('get', '/users/:user_id', USERS, 'Chi tiết người dùng (kèm role_ids)', c.getUser, { params: adminOrg_schema_1.userIdParamSchema });
route('post', '/users', USERS, 'Thêm người dùng', c.createUser, { body: adminOrg_schema_1.createUserSchema });
route('put', '/users', USERS, 'Cập nhật người dùng', c.updateUser, { body: adminOrg_schema_1.updateUserSchema });
route('post', '/users/delete', USERS, 'Xoá (mềm) người dùng + thu hồi phiên', c.deleteUsers, { body: adminOrg_schema_1.userIdsSchema });
route('post', '/users/lock', USERS, 'Đổi cờ khoá (online_flag)', c.lockUser, { body: adminOrg_schema_1.lockUserSchema });
route('post', '/users/reset-password', USERS, 'Đặt lại mật khẩu ngẫu nhiên + gửi email', c.resetPassword, {
    body: adminOrg_schema_1.userIdSchema,
});
route('put', '/users/:user_id/roles', USERS, 'Gán lại toàn bộ nhóm quyền của user', c.setUserRoles, {
    params: adminOrg_schema_1.userIdParamSchema,
    body: adminOrg_schema_1.setUserRolesSchema,
});
const ORG = 'Admin - Tổ chức';
route('post', '/branches/search', ORG, 'Tìm kiếm chi nhánh', c.searchBranches, { body: adminOrg_schema_1.searchBranchSchema });
route('get', '/branches/dropdown', ORG, 'Danh sách chi nhánh (dropdown)', c.branchDropdown);
route('post', '/branches', ORG, 'Thêm/sửa chi nhánh (branch_id rỗng = thêm)', c.upsertBranch, { body: adminOrg_schema_1.upsertBranchSchema });
route('post', '/branches/delete', ORG, 'Xoá (mềm) chi nhánh', c.deleteBranches, { body: adminOrg_schema_1.intIdsSchema });
route('post', '/departments/search', ORG, 'Tìm kiếm phòng ban', c.searchDepartments, { body: adminOrg_schema_1.searchDepartmentSchema });
route('get', '/departments/dropdown', ORG, 'Danh sách phòng ban (dropdown)', c.departmentDropdown);
route('post', '/departments', ORG, 'Thêm/sửa phòng ban', c.upsertDepartment, { body: adminOrg_schema_1.upsertDepartmentSchema });
route('post', '/departments/delete', ORG, 'Xoá (mềm) phòng ban', c.deleteDepartments, { body: adminOrg_schema_1.intIdsSchema });
route('post', '/positions/search', ORG, 'Tìm kiếm chức vụ', c.searchPositions, { body: adminOrg_schema_1.searchPositionSchema });
route('get', '/positions/dropdown', ORG, 'Danh sách chức vụ (dropdown)', c.positionDropdown);
route('post', '/positions', ORG, 'Thêm/sửa chức vụ', c.upsertPosition, { body: adminOrg_schema_1.upsertPositionSchema });
route('post', '/positions/delete', ORG, 'Xoá (mềm) chức vụ', c.deletePositions, { body: adminOrg_schema_1.intIdsSchema });
const ROLES = 'Admin - Nhóm quyền';
route('post', '/roles/search', ROLES, 'Tìm kiếm nhóm quyền', c.searchRoles, { body: adminOrg_schema_1.searchRoleSchema });
route('get', '/roles/dropdown', ROLES, 'Danh sách nhóm quyền (dropdown)', c.roleDropdown);
route('post', '/roles', ROLES, 'Thêm/sửa nhóm quyền (role_id rỗng = thêm)', c.upsertRole, { body: adminOrg_schema_1.upsertRoleSchema });
route('post', '/roles/delete', ROLES, 'Xoá (mềm) nhóm quyền (không xoá được "sa")', c.deleteRoles, { body: adminOrg_schema_1.roleIdsSchema });
const SYNC = 'Admin - Đồng bộ';
route('get', '/sync/status', SYNC, 'Trạng thái hàng đợi đồng bộ theo đích', c.syncStatus);
route('post', '/sync/retry', SYNC, 'Đưa các dòng lỗi (failed) về hàng đợi', c.syncRetry, { body: adminOrg_schema_1.syncTargetSchema });
route('post', '/sync/resync', SYNC, 'Đồng bộ lại toàn bộ dữ liệu sang 1 đích', c.syncResync, { body: adminOrg_schema_1.syncResyncSchema });
exports.default = adminOrgRouter;
