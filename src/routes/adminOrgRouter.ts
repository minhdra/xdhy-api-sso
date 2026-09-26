import { type RequestHandler, Router } from 'express';
import { container } from 'tsyringe';

import { avatarUpload } from '../config/avatarUpload';
import { AdminOrgController } from '../controllers/adminOrgController';
import { requireAuth } from '../middlewares/auth';
import { requireAdmin } from '../middlewares/requireAdmin';
import { defineRoute } from '../openapi/defineRoute';
import {
  createUserSchema,
  intIdsSchema,
  lockUserSchema,
  roleIdsSchema,
  searchBranchSchema,
  searchDepartmentSchema,
  searchPositionSchema,
  searchRoleSchema,
  searchUserSchema,
  setUserRolesSchema,
  syncResyncSchema,
  syncTargetSchema,
  updateUserSchema,
  upsertBranchSchema,
  upsertDepartmentSchema,
  upsertPositionSchema,
  upsertRoleSchema,
  userIdParamSchema,
  userIdSchema,
  userIdsSchema,
} from '../schemas/adminOrg.schema';

// Quản trị người dùng / chi nhánh / phòng ban / chức vụ / nhóm quyền + trạng
// thái đồng bộ sang app (26/09/2026 - chuyển từ api-core). Chỉ admin (role sa).
// Mọi thay đổi ghi a_sync_outbox -> worker đồng bộ sang finance/task/chat/meeting.
const adminOrgRouter = Router();
const c = container.resolve(AdminOrgController);
const ok = { 200: { description: 'OK' }, 400: { description: 'Dữ liệu không hợp lệ' }, 403: { description: 'Không phải quản trị viên' } };

adminOrgRouter.use('/admin/org', requireAuth, requireAdmin);

type Method = 'get' | 'post' | 'put';
function route(
  method: Method,
  path: string,
  tag: string,
  summary: string,
  handler: RequestHandler,
  schema?: Parameters<typeof defineRoute>[0]['schema'],
) {
  const expressPath = `/admin/org${path}`;
  const openapiPath = expressPath.replace(/:([a-z_]+)/g, '{$1}');
  adminOrgRouter[method](
    expressPath,
    ...defineRoute({ method, path: openapiPath, tags: [tag], summary, schema, responses: ok }),
    handler,
  );
}

const USERS = 'Admin - Người dùng';
route('post', '/users/search', USERS, 'Tìm kiếm người dùng (phân trang)', c.searchUsers, { body: searchUserSchema });
route('get', '/users/:user_id', USERS, 'Chi tiết người dùng (kèm role_ids)', c.getUser, { params: userIdParamSchema });
route('post', '/users', USERS, 'Thêm người dùng', c.createUser, { body: createUserSchema });
route('put', '/users', USERS, 'Cập nhật người dùng', c.updateUser, { body: updateUserSchema });
route('post', '/users/delete', USERS, 'Xoá (mềm) người dùng + thu hồi phiên', c.deleteUsers, { body: userIdsSchema });
route('post', '/users/lock', USERS, 'Đổi cờ khoá (online_flag)', c.lockUser, { body: lockUserSchema });
route('post', '/users/reset-password', USERS, 'Đặt lại mật khẩu ngẫu nhiên + gửi email', c.resetPassword, {
  body: userIdSchema,
});
adminOrgRouter.post(
  '/admin/org/users/:user_id/avatar',
  ...defineRoute({
    method: 'post',
    path: '/admin/org/users/{user_id}/avatar',
    tags: [USERS],
    summary: 'Đổi ảnh đại diện của user (multipart, field "file", ảnh ≤5MB)',
    schema: { params: userIdParamSchema },
    responses: ok,
  }),
  avatarUpload,
  c.setUserAvatar,
);
route('put', '/users/:user_id/roles', USERS, 'Gán lại toàn bộ nhóm quyền của user', c.setUserRoles, {
  params: userIdParamSchema,
  body: setUserRolesSchema,
});

const ORG = 'Admin - Tổ chức';
route('post', '/branches/search', ORG, 'Tìm kiếm chi nhánh', c.searchBranches, { body: searchBranchSchema });
route('get', '/branches/dropdown', ORG, 'Danh sách chi nhánh (dropdown)', c.branchDropdown);
route('post', '/branches', ORG, 'Thêm/sửa chi nhánh (branch_id rỗng = thêm)', c.upsertBranch, { body: upsertBranchSchema });
route('post', '/branches/delete', ORG, 'Xoá (mềm) chi nhánh', c.deleteBranches, { body: intIdsSchema });
route('post', '/departments/search', ORG, 'Tìm kiếm phòng ban', c.searchDepartments, { body: searchDepartmentSchema });
route('get', '/departments/dropdown', ORG, 'Danh sách phòng ban (dropdown)', c.departmentDropdown);
route('post', '/departments', ORG, 'Thêm/sửa phòng ban', c.upsertDepartment, { body: upsertDepartmentSchema });
route('post', '/departments/delete', ORG, 'Xoá (mềm) phòng ban', c.deleteDepartments, { body: intIdsSchema });
route('post', '/positions/search', ORG, 'Tìm kiếm chức vụ', c.searchPositions, { body: searchPositionSchema });
route('get', '/positions/dropdown', ORG, 'Danh sách chức vụ (dropdown)', c.positionDropdown);
route('post', '/positions', ORG, 'Thêm/sửa chức vụ', c.upsertPosition, { body: upsertPositionSchema });
route('post', '/positions/delete', ORG, 'Xoá (mềm) chức vụ', c.deletePositions, { body: intIdsSchema });

const ROLES = 'Admin - Nhóm quyền';
route('post', '/roles/search', ROLES, 'Tìm kiếm nhóm quyền', c.searchRoles, { body: searchRoleSchema });
route('get', '/roles/dropdown', ROLES, 'Danh sách nhóm quyền (dropdown)', c.roleDropdown);
route('post', '/roles', ROLES, 'Thêm/sửa nhóm quyền (role_id rỗng = thêm)', c.upsertRole, { body: upsertRoleSchema });
route('post', '/roles/delete', ROLES, 'Xoá (mềm) nhóm quyền (không xoá được "sa")', c.deleteRoles, { body: roleIdsSchema });

const SYNC = 'Admin - Đồng bộ';
route('get', '/sync/status', SYNC, 'Trạng thái hàng đợi đồng bộ theo đích', c.syncStatus);
route('post', '/sync/retry', SYNC, 'Đưa các dòng lỗi (failed) về hàng đợi', c.syncRetry, { body: syncTargetSchema });
route('post', '/sync/resync', SYNC, 'Đồng bộ lại toàn bộ dữ liệu sang 1 đích', c.syncResync, { body: syncResyncSchema });

export default adminOrgRouter;
