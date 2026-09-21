"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const tsyringe_1 = require("tsyringe");
const cookie_1 = require("../config/cookie");
const jwt_1 = require("../config/jwt");
const AppError_1 = require("../errors/AppError");
const authService_1 = require("../services/authService");
const appService_1 = require("../services/appService");
let AuthController = class AuthController {
    constructor(authService, appService) {
        this.authService = authService;
        this.appService = appService;
    }
    async login(req, res, next) {
        try {
            // Body đã qua zod (loginSchema) - username/password chắc chắn có,
            // remember là boolean (default false).
            const { username, password, remember } = req.body;
            const rememberFlag = remember === true;
            const result = await this.authService.login(username, password, rememberFlag, {
                userAgent: req.headers['user-agent'],
                ip: req.ip,
            });
            if (!result) {
                next(new AppError_1.AppError(401, 'Sai tài khoản hoặc mật khẩu.'));
                return;
            }
            const accessToken = (0, jwt_1.generateAccessToken)({
                user_id: result.user.user_id,
                full_name: result.user.full_name,
                user_name: result.user.user_name,
                role_group: result.user.role_group,
                session_id: result.sessionId,
            }, result.accessExpiresIn);
            const refreshToken = (0, jwt_1.generateRefreshToken)({ user_id: result.user.user_id, session_id: result.sessionId, jti: result.jti }, result.refreshExpiresIn);
            res.cookie(cookie_1.ACCESS_COOKIE, accessToken, (0, cookie_1.accessCookieOptions)(rememberFlag));
            res.cookie(cookie_1.REFRESH_COOKIE, refreshToken, (0, cookie_1.refreshCookieOptions)(rememberFlag));
            res.json(result.user);
        }
        catch (error) {
            next(error);
        }
    }
    async refresh(req, res, next) {
        try {
            const token = req.cookies?.[cookie_1.REFRESH_COOKIE];
            if (!token) {
                next(new AppError_1.AppError(401, 'Bạn không được cấp quyền!'));
                return;
            }
            const decoded = (0, jwt_1.verifyToken)(token);
            if (!decoded || decoded.type !== 'refresh' || !decoded.session_id || !decoded.jti) {
                next(new AppError_1.AppError(401, 'Phiên đăng nhập hết hạn.'));
                return;
            }
            const result = await this.authService.refresh(decoded.session_id, decoded.jti);
            if (!result) {
                next(new AppError_1.AppError(401, 'Phiên đăng nhập đã bị thu hồi hoặc hết hạn.'));
                return;
            }
            const accessToken = (0, jwt_1.generateAccessToken)({ user_id: result.user_id, session_id: result.session_id }, result.accessExpiresIn);
            res.cookie(cookie_1.ACCESS_COOKIE, accessToken, (0, cookie_1.accessCookieOptions)(result.remember));
            res.json({ success: true });
        }
        catch (error) {
            next(error);
        }
    }
    async logout(req, res, next) {
        try {
            const token = req.cookies?.[cookie_1.REFRESH_COOKIE];
            const decoded = token ? (0, jwt_1.verifyToken)(token) : null;
            await this.authService.logout(decoded?.session_id ?? null);
            res.clearCookie(cookie_1.ACCESS_COOKIE, (0, cookie_1.clearCookieOptions)());
            res.clearCookie(cookie_1.REFRESH_COOKIE, (0, cookie_1.clearCookieOptions)());
            res.json({ success: true });
        }
        catch (error) {
            next(error);
        }
    }
    async me(req, res, next) {
        try {
            const token = req.cookies?.[cookie_1.ACCESS_COOKIE] || req.headers.authorization?.split(' ')[1];
            if (!token) {
                next(new AppError_1.AppError(401, 'Bạn không được cấp quyền!'));
                return;
            }
            const decoded = (0, jwt_1.verifyToken)(token);
            if (!decoded || decoded.type !== 'access') {
                next(new AppError_1.AppError(401, 'Bạn không được cấp quyền!'));
                return;
            }
            // Chốt chặn thật ở backend cho app nào tự khai `?app=<key>` lúc gọi
            // /me (thường là lúc bootstrap) - không có tham số này thì /me chỉ trả
            // danh tính như cũ (sso-web tự gọi cho chính nó không cần gate).
            // Trước đây chỉ ẩn/hiện app ở trang chủ sso-web (GET /apps), có token
            // hợp lệ vẫn gõ thẳng URL vào được - đây là nơi chặn thật.
            const { app: appKey } = req.query;
            if (appKey) {
                const allowed = await this.appService.canAccessApp(decoded.user_id, appKey);
                if (!allowed) {
                    next(new AppError_1.AppError(403, 'Bạn không có quyền truy cập ứng dụng này.'));
                    return;
                }
            }
            const result = await this.authService.me(decoded.user_id);
            if (!result) {
                next(new AppError_1.AppError(404, 'Bản ghi không tồn tại.'));
                return;
            }
            res.json(result);
        }
        catch (error) {
            next(error);
        }
    }
    async forgotPassword(req, res, next) {
        try {
            const { email } = req.body;
            // Luôn trả 1 message chung dù email có tồn tại hay không - tránh lộ
            // thông tin tài khoản nào tồn tại (service tự bỏ qua âm thầm nếu không
            // tìm thấy).
            await this.authService.forgotPassword(email);
            res.json({
                message: 'Nếu email tồn tại trong hệ thống, chúng tôi đã gửi link đặt lại mật khẩu.',
                success: true,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async resetPasswordConfirm(req, res, next) {
        try {
            // Body đã qua zod (resetPasswordConfirmSchema): token có, newPassword >= 6.
            const { token, newPassword } = req.body;
            const ok = await this.authService.resetPasswordConfirm(token, newPassword);
            if (!ok) {
                next(new AppError_1.AppError(400, 'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.'));
                return;
            }
            res.json({ message: 'Đổi mật khẩu thành công.', success: true });
        }
        catch (error) {
            next(error);
        }
    }
};
exports.AuthController = AuthController;
exports.AuthController = AuthController = __decorate([
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [authService_1.AuthService,
        appService_1.AppService])
], AuthController);
