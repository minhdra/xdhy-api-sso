"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tsyringe_1 = require("tsyringe");
const authController_1 = require("../controllers/authController");
const auth_1 = require("../middlewares/auth");
const defineRoute_1 = require("../openapi/defineRoute");
const auth_schema_1 = require("../schemas/auth.schema");
const authRouter = (0, express_1.Router)();
const authController = tsyringe_1.container.resolve(authController_1.AuthController);
const tags = ['Auth'];
authRouter.post('/login', ...(0, defineRoute_1.defineRoute)({
    method: 'post',
    path: '/login',
    tags,
    summary: 'Đăng nhập bằng tài khoản/email/số điện thoại, set cookie access + refresh',
    schema: { body: auth_schema_1.loginSchema },
    responses: {
        200: { description: 'Thành công - trả thông tin user' },
        401: { description: 'Sai tài khoản hoặc mật khẩu' },
    },
}), authController.login.bind(authController));
// Gateway gọi endpoint này qua network nội bộ trước khi cho access token đi
// tới api-core/api-task. requireAuth kiểm cả chữ ký JWT lẫn trạng thái session.
authRouter.get('/session/validate', auth_1.requireAuth, (_req, res) => {
    res.status(204).send();
});
authRouter.post('/refresh', ...(0, defineRoute_1.defineRoute)({
    method: 'post',
    path: '/refresh',
    tags,
    summary: 'Cấp lại access token từ refresh token cookie',
    responses: {
        200: { description: 'Đã cấp access token mới' },
        401: { description: 'Phiên hết hạn hoặc bị thu hồi' },
    },
}), authController.refresh.bind(authController));
authRouter.post('/logout', ...(0, defineRoute_1.defineRoute)({
    method: 'post',
    path: '/logout',
    tags,
    summary: 'Thu hồi phiên hiện tại + xoá cookie',
    responses: { 200: { description: 'Đã đăng xuất' } },
}), authController.logout.bind(authController));
authRouter.get('/me', ...(0, defineRoute_1.defineRoute)({
    method: 'get',
    path: '/me',
    tags,
    summary: 'Thông tin user đang đăng nhập + cây quyền (functions/actions). ' +
        'Kèm ?app=<app_key> để tự bảo vệ app đó (403 nếu không có quyền).',
    schema: { query: auth_schema_1.meQuerySchema },
    responses: {
        200: { description: 'Thông tin user' },
        401: { description: 'Chưa đăng nhập' },
        403: { description: 'Có app_key nhưng không có quyền truy cập app đó' },
    },
}), auth_1.requireAuth, authController.me.bind(authController));
authRouter.post('/forgot-password', ...(0, defineRoute_1.defineRoute)({
    method: 'post',
    path: '/forgot-password',
    tags,
    summary: 'Gửi email link đặt lại mật khẩu (luôn trả cùng message dù email tồn tại hay không)',
    schema: { body: auth_schema_1.forgotPasswordSchema },
    responses: { 200: { description: 'Đã tiếp nhận yêu cầu' } },
}), authController.forgotPassword.bind(authController));
authRouter.post('/reset-password-confirm', ...(0, defineRoute_1.defineRoute)({
    method: 'post',
    path: '/reset-password-confirm',
    tags,
    summary: 'Đặt mật khẩu mới bằng token từ email (token 1 lần, hạn 1 giờ)',
    schema: { body: auth_schema_1.resetPasswordConfirmSchema },
    responses: {
        200: { description: 'Đổi mật khẩu thành công' },
        400: { description: 'Token không hợp lệ hoặc hết hạn' },
    },
}), authController.resetPasswordConfirm.bind(authController));
exports.default = authRouter;
