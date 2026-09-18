import { Router } from 'express';
import { container } from 'tsyringe';

import { AdminAppController } from '../controllers/adminAppController';
import { requireAuth } from '../middlewares/auth';
import { requireAdmin } from '../middlewares/requireAdmin';
import { defineRoute } from '../openapi/defineRoute';
import {
  appAccessCandidatesQuerySchema,
  appIdParamSchema,
  deleteAppSchema,
  mutateAppAccessSchema,
  setAppAccessSchema,
  upsertAppSchema,
} from '../schemas/adminApp.schema';

const adminAppRouter = Router();
const controller = container.resolve(AdminAppController);
const tags = ['Admin apps'];

// Chỉ quản trị viên (role_code 'sa') mới vào được toàn bộ router này - xem
// requireAdmin.ts.
adminAppRouter.use(requireAuth, requireAdmin);

adminAppRouter.get(
  '/admin/apps',
  ...defineRoute({
    method: 'get',
    path: '/admin/apps',
    tags,
    summary: 'Danh sách ứng dụng (quản trị) kèm số người đã được cấp quyền',
    responses: { 200: { description: 'OK' }, 403: { description: 'Không phải quản trị viên' } },
  }),
  controller.listApps.bind(controller),
);

adminAppRouter.post(
  '/admin/apps',
  ...defineRoute({
    method: 'post',
    path: '/admin/apps',
    tags,
    summary: 'Tạo mới hoặc cập nhật ứng dụng (app_id rỗng = tạo mới)',
    schema: { body: upsertAppSchema },
    responses: { 200: { description: 'Đã lưu' }, 400: { description: 'Mã ứng dụng đã tồn tại' } },
  }),
  controller.upsertApp.bind(controller),
);

adminAppRouter.post(
  '/admin/apps/delete',
  ...defineRoute({
    method: 'post',
    path: '/admin/apps/delete',
    tags,
    summary: 'Xoá (mềm) 1 ứng dụng - xoá luôn toàn bộ quyền đã cấp trên app đó',
    schema: { body: deleteAppSchema },
    responses: { 200: { description: 'Đã xoá' }, 400: { description: 'Không tìm thấy' } },
  }),
  controller.deleteApp.bind(controller),
);

adminAppRouter.get(
  '/admin/apps/:app_id/access',
  ...defineRoute({
    method: 'get',
    path: '/admin/apps/{app_id}/access',
    tags,
    summary: 'Danh sách người đang được cấp quyền truy cập 1 ứng dụng',
    schema: { params: appIdParamSchema },
    responses: { 200: { description: 'OK' } },
  }),
  controller.listAccess.bind(controller),
);

adminAppRouter.post(
  '/admin/apps/:app_id/access',
  ...defineRoute({
    method: 'post',
    path: '/admin/apps/{app_id}/access',
    tags,
    summary: 'Thay toàn bộ danh sách người được cấp quyền truy cập 1 ứng dụng',
    schema: { params: appIdParamSchema, body: setAppAccessSchema },
    responses: { 200: { description: 'Đã cập nhật' }, 400: { description: 'Không tìm thấy app' } },
  }),
  controller.setAccess.bind(controller),
);

adminAppRouter.get(
  '/admin/apps/:app_id/access-candidates',
  ...defineRoute({
    method: 'get',
    path: '/admin/apps/{app_id}/access-candidates',
    tags,
    summary: 'Danh sách người chưa có quyền hiệu lực, có tìm kiếm và phân trang',
    schema: { params: appIdParamSchema, query: appAccessCandidatesQuerySchema },
    responses: { 200: { description: 'OK' }, 400: { description: 'Không tìm thấy app' } },
  }),
  controller.listAccessCandidates.bind(controller),
);

adminAppRouter.post(
  '/admin/apps/:app_id/access/add',
  ...defineRoute({
    method: 'post',
    path: '/admin/apps/{app_id}/access/add',
    tags,
    summary: 'Cộng quyền truy cập cho các user hợp lệ chưa có quyền',
    schema: { params: appIdParamSchema, body: mutateAppAccessSchema },
    responses: { 200: { description: 'Đã thêm' }, 400: { description: 'Dữ liệu không hợp lệ' } },
  }),
  controller.addAccess.bind(controller),
);

adminAppRouter.post(
  '/admin/apps/:app_id/access/remove',
  ...defineRoute({
    method: 'post',
    path: '/admin/apps/{app_id}/access/remove',
    tags,
    summary: 'Gỡ quyền truy cập theo danh sách user',
    schema: { params: appIdParamSchema, body: mutateAppAccessSchema },
    responses: { 200: { description: 'Đã gỡ' }, 400: { description: 'Dữ liệu không hợp lệ' } },
  }),
  controller.removeAccess.bind(controller),
);

adminAppRouter.get(
  '/admin/users',
  ...defineRoute({
    method: 'get',
    path: '/admin/users',
    tags,
    summary: 'Danh sách người dùng active - dùng cho ô chọn cấp quyền app',
    responses: { 200: { description: 'OK' } },
  }),
  controller.listUsers.bind(controller),
);

export default adminAppRouter;
