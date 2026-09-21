"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPasswordConfirmSchema = exports.forgotPasswordSchema = exports.meQuerySchema = exports.loginSchema = void 0;
const zod_1 = require("../openapi/zod");
exports.loginSchema = zod_1.z
    .object({
    username: zod_1.z.string().min(1, 'Tài khoản là bắt buộc'),
    password: zod_1.z.string().min(1, 'Mật khẩu là bắt buộc'),
    remember: zod_1.z.boolean().optional().default(false),
})
    .openapi('LoginRequest');
// `app` (tuỳ chọn): app_key của app đang gọi /me để tự bảo vệ - xem
// AppService.canAccessApp. Không truyền = chỉ lấy danh tính, không gate app
// nào (đúng cách sso-web tự gọi cho chính nó).
exports.meQuerySchema = zod_1.z
    .object({
    app: zod_1.z.string().min(1).optional(),
})
    .openapi('MeQuery');
exports.forgotPasswordSchema = zod_1.z
    .object({
    email: zod_1.z.string().email('Email không hợp lệ'),
})
    .openapi('ForgotPasswordRequest');
exports.resetPasswordConfirmSchema = zod_1.z
    .object({
    token: zod_1.z.string().min(1, 'Thiếu token'),
    newPassword: zod_1.z.string().min(6, 'Mật khẩu mới phải có ít nhất 6 ký tự'),
})
    .openapi('ResetPasswordConfirmRequest');
