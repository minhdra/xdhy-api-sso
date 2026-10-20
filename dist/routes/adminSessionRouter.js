"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tsyringe_1 = require("tsyringe");
const adminSessionController_1 = require("../controllers/adminSessionController");
const auth_1 = require("../middlewares/auth");
const requireAdmin_1 = require("../middlewares/requireAdmin");
const defineRoute_1 = require("../openapi/defineRoute");
const account_schema_1 = require("../schemas/account.schema");
const adminSession_schema_1 = require("../schemas/adminSession.schema");
const adminSessionRouter = (0, express_1.Router)();
const controller = tsyringe_1.container.resolve(adminSessionController_1.AdminSessionController);
const tags = ['Admin sessions'];
adminSessionRouter.use('/admin/sessions', auth_1.requireAuth, requireAdmin_1.requireAdmin);
adminSessionRouter.get('/admin/sessions', ...(0, defineRoute_1.defineRoute)({
    method: 'get',
    path: '/admin/sessions',
    tags,
    summary: 'Phiên đăng nhập đang hoạt động của mọi người (q: tên đăng nhập / họ tên / IP)',
    schema: { query: adminSession_schema_1.adminSessionsQuerySchema },
    responses: { 200: { description: 'OK' }, 403: { description: 'Không phải quản trị viên' } },
}), controller.list.bind(controller));
adminSessionRouter.post('/admin/sessions/revoke', ...(0, defineRoute_1.defineRoute)({
    method: 'post',
    path: '/admin/sessions/revoke',
    tags,
    summary: 'Thu hồi 1 phiên bất kỳ (không phải phiên hiện tại)',
    schema: { body: account_schema_1.revokeSessionSchema },
    responses: {
        200: { description: 'Đã thu hồi' },
        400: { description: 'Không thể thu hồi phiên hiện tại' },
        404: { description: 'Phiên không tồn tại' },
    },
}), controller.revoke.bind(controller));
adminSessionRouter.post('/admin/sessions/revoke-user', ...(0, defineRoute_1.defineRoute)({
    method: 'post',
    path: '/admin/sessions/revoke-user',
    tags,
    summary: 'Thu hồi mọi phiên của 1 người dùng (không áp dụng cho chính mình)',
    schema: { body: adminSession_schema_1.adminRevokeUserSessionsSchema },
    responses: { 200: { description: 'Đã thu hồi' }, 400: { description: 'Là tài khoản của chính bạn' } },
}), controller.revokeUser.bind(controller));
exports.default = adminSessionRouter;
