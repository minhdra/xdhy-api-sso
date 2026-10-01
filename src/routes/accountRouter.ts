import { Router } from 'express';
import { container } from 'tsyringe';

import { avatarUpload } from '../config/avatarUpload';
import { AccountController } from '../controllers/accountController';
import { requireAuth } from '../middlewares/auth';
import { defineRoute } from '../openapi/defineRoute';
import {
  changePasswordSchema,
  revokeSessionSchema,
  updateProfileSchema,
} from '../schemas/account.schema';

const accountRouter = Router();
const accountController = container.resolve(AccountController);
const tags = ['Account'];

// Toàn bộ route dưới đây cần đăng nhập.
accountRouter.use(requireAuth);

accountRouter.get(
  '/apps',
  ...defineRoute({
    method: 'get',
    path: '/apps',
    tags,
    summary: 'Danh sách ứng dụng truy cập được (hiển thị ở trang chủ sso-web)',
    responses: { 200: { description: 'Danh sách app' }, 401: { description: 'Chưa đăng nhập' } },
  }),
  accountController.listApps.bind(accountController),
);

accountRouter.get(
  '/account/profile',
  ...defineRoute({
    method: 'get',
    path: '/account/profile',
    tags,
    summary: 'Hồ sơ user đang đăng nhập',
    responses: { 200: { description: 'Hồ sơ' }, 401: { description: 'Chưa đăng nhập' } },
  }),
  accountController.getProfile.bind(accountController),
);

accountRouter.put(
  '/account/profile',
  ...defineRoute({
    method: 'put',
    path: '/account/profile',
    tags,
    summary: 'Cập nhật thông tin cá nhân (tên, email, sđt, giới tính, ngày sinh, avatar)',
    schema: { body: updateProfileSchema },
    responses: { 200: { description: 'Đã cập nhật' }, 400: { description: 'Dữ liệu không hợp lệ' } },
  }),
  accountController.updateProfile.bind(accountController),
);

accountRouter.post(
  '/account/avatar',
  ...defineRoute({
    method: 'post',
    path: '/account/avatar',
    tags,
    summary: 'Tải lên ảnh đại diện (multipart/form-data, field "file", ảnh ≤ 5MB)',
    responses: {
      200: { description: 'Đã cập nhật avatar - trả URL mới' },
      400: { description: 'File không hợp lệ' },
    },
  }),
  avatarUpload,
  accountController.uploadAvatar.bind(accountController),
);

accountRouter.post(
  '/account/change-password',
  ...defineRoute({
    method: 'post',
    path: '/account/change-password',
    tags,
    summary: 'Đổi mật khẩu (xác thực mật khẩu hiện tại)',
    schema: { body: changePasswordSchema },
    responses: {
      200: { description: 'Đã đổi mật khẩu' },
      400: { description: 'Mật khẩu hiện tại không đúng / mật khẩu mới không hợp lệ' },
    },
  }),
  accountController.changePassword.bind(accountController),
);

accountRouter.get(
  '/account/sessions',
  ...defineRoute({
    method: 'get',
    path: '/account/sessions',
    tags,
    summary: 'Danh sách phiên đăng nhập đang hoạt động',
    responses: { 200: { description: 'Danh sách phiên' }, 401: { description: 'Chưa đăng nhập' } },
  }),
  accountController.listSessions.bind(accountController),
);

accountRouter.post(
  '/account/sessions/revoke',
  ...defineRoute({
    method: 'post',
    path: '/account/sessions/revoke',
    tags,
    summary: 'Thu hồi 1 phiên đăng nhập (không phải phiên hiện tại)',
    schema: { body: revokeSessionSchema },
    responses: {
      200: { description: 'Đã thu hồi' },
      400: { description: 'Không thể thu hồi phiên hiện tại' },
      404: { description: 'Phiên không tồn tại' },
    },
  }),
  accountController.revokeSession.bind(accountController),
);

export default accountRouter;
