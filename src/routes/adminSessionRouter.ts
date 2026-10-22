import { Router } from 'express';
import { container } from 'tsyringe';

import { AdminSessionController } from '../controllers/adminSessionController';
import { requireAuth } from '../middlewares/auth';
import { requireAdmin } from '../middlewares/requireAdmin';
import { defineRoute } from '../openapi/defineRoute';
import { revokeSessionSchema } from '../schemas/account.schema';
import { adminRevokeUserSessionsSchema, adminSessionsQuerySchema } from '../schemas/adminSession.schema';

const adminSessionRouter = Router();
const controller = container.resolve(AdminSessionController);
const tags = ['Admin sessions'];

adminSessionRouter.use('/admin/sessions', requireAuth, requireAdmin);

adminSessionRouter.get(
  '/admin/sessions',
  ...defineRoute({
    method: 'get',
    path: '/admin/sessions',
    tags,
    summary: 'Người đang có phiên đăng nhập (gom theo người, phân trang theo người) kèm phiên của từng người (q: tên đăng nhập / họ tên / IP)',
    schema: { query: adminSessionsQuerySchema },
    responses: { 200: { description: 'OK' }, 403: { description: 'Không phải quản trị viên' } },
  }),
  controller.list.bind(controller),
);

adminSessionRouter.post(
  '/admin/sessions/revoke',
  ...defineRoute({
    method: 'post',
    path: '/admin/sessions/revoke',
    tags,
    summary: 'Thu hồi 1 phiên bất kỳ (không phải phiên hiện tại)',
    schema: { body: revokeSessionSchema },
    responses: {
      200: { description: 'Đã thu hồi' },
      400: { description: 'Không thể thu hồi phiên hiện tại' },
      404: { description: 'Phiên không tồn tại' },
    },
  }),
  controller.revoke.bind(controller),
);

adminSessionRouter.post(
  '/admin/sessions/revoke-user',
  ...defineRoute({
    method: 'post',
    path: '/admin/sessions/revoke-user',
    tags,
    summary: 'Thu hồi mọi phiên của 1 người dùng (không áp dụng cho chính mình)',
    schema: { body: adminRevokeUserSessionsSchema },
    responses: { 200: { description: 'Đã thu hồi' }, 400: { description: 'Là tài khoản của chính bạn' } },
  }),
  controller.revokeUser.bind(controller),
);

export default adminSessionRouter;
