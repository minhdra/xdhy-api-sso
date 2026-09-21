"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tsyringe_1 = require("tsyringe");
const avatarUpload_1 = require("../config/avatarUpload");
const accountController_1 = require("../controllers/accountController");
const auth_1 = require("../middlewares/auth");
const defineRoute_1 = require("../openapi/defineRoute");
const account_schema_1 = require("../schemas/account.schema");
const accountRouter = (0, express_1.Router)();
const accountController = tsyringe_1.container.resolve(accountController_1.AccountController);
const tags = ['Account'];
// Toàn bộ route dưới đây cần đăng nhập.
accountRouter.use(auth_1.requireAuth);
accountRouter.get('/apps', ...(0, defineRoute_1.defineRoute)({
    method: 'get',
    path: '/apps',
    tags,
    summary: 'Danh sách ứng dụng truy cập được (hiển thị ở trang chủ sso-web)',
    responses: { 200: { description: 'Danh sách app' }, 401: { description: 'Chưa đăng nhập' } },
}), accountController.listApps.bind(accountController));
accountRouter.get('/account/profile', ...(0, defineRoute_1.defineRoute)({
    method: 'get',
    path: '/account/profile',
    tags,
    summary: 'Hồ sơ user đang đăng nhập',
    responses: { 200: { description: 'Hồ sơ' }, 401: { description: 'Chưa đăng nhập' } },
}), accountController.getProfile.bind(accountController));
accountRouter.put('/account/profile', ...(0, defineRoute_1.defineRoute)({
    method: 'put',
    path: '/account/profile',
    tags,
    summary: 'Cập nhật thông tin cá nhân (tên, email, sđt, giới tính, ngày sinh, avatar)',
    schema: { body: account_schema_1.updateProfileSchema },
    responses: { 200: { description: 'Đã cập nhật' }, 400: { description: 'Dữ liệu không hợp lệ' } },
}), accountController.updateProfile.bind(accountController));
accountRouter.post('/account/avatar', ...(0, defineRoute_1.defineRoute)({
    method: 'post',
    path: '/account/avatar',
    tags,
    summary: 'Tải lên ảnh đại diện (multipart/form-data, field "file", ảnh ≤ 5MB)',
    responses: {
        200: { description: 'Đã cập nhật avatar - trả URL mới' },
        400: { description: 'File không hợp lệ' },
    },
}), avatarUpload_1.resolveAvatarUploadOwner, avatarUpload_1.avatarUpload, accountController.uploadAvatar.bind(accountController));
accountRouter.post('/account/change-password', ...(0, defineRoute_1.defineRoute)({
    method: 'post',
    path: '/account/change-password',
    tags,
    summary: 'Đổi mật khẩu (xác thực mật khẩu hiện tại)',
    schema: { body: account_schema_1.changePasswordSchema },
    responses: {
        200: { description: 'Đã đổi mật khẩu' },
        400: { description: 'Mật khẩu hiện tại không đúng / mật khẩu mới không hợp lệ' },
    },
}), accountController.changePassword.bind(accountController));
accountRouter.get('/account/sessions', ...(0, defineRoute_1.defineRoute)({
    method: 'get',
    path: '/account/sessions',
    tags,
    summary: 'Danh sách phiên đăng nhập đang hoạt động',
    responses: { 200: { description: 'Danh sách phiên' }, 401: { description: 'Chưa đăng nhập' } },
}), accountController.listSessions.bind(accountController));
accountRouter.post('/account/sessions/revoke', ...(0, defineRoute_1.defineRoute)({
    method: 'post',
    path: '/account/sessions/revoke',
    tags,
    summary: 'Thu hồi 1 phiên đăng nhập (không phải phiên hiện tại)',
    schema: { body: account_schema_1.revokeSessionSchema },
    responses: {
        200: { description: 'Đã thu hồi' },
        400: { description: 'Không thể thu hồi phiên hiện tại' },
        404: { description: 'Phiên không tồn tại' },
    },
}), accountController.revokeSession.bind(accountController));
exports.default = accountRouter;
