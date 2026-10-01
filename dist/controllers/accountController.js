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
exports.AccountController = void 0;
const tsyringe_1 = require("tsyringe");
const cookie_1 = require("../config/cookie");
const jwt_1 = require("../config/jwt");
const AppError_1 = require("../errors/AppError");
const accountService_1 = require("../services/accountService");
const appService_1 = require("../services/appService");
// session_id của phiên đang gọi - nằm trong refresh token cookie (payload
// refresh = { user_id, session_id, jti }). Access token không mang session_id.
function currentSessionId(req) {
    const token = req.cookies?.[cookie_1.REFRESH_COOKIE];
    const decoded = token ? (0, jwt_1.verifyToken)(token) : null;
    return decoded && decoded.type === 'refresh' && decoded.session_id ? decoded.session_id : null;
}
let AccountController = class AccountController {
    constructor(accountService, appService) {
        this.accountService = accountService;
        this.appService = appService;
    }
    // Danh sách app cho trang chủ - trước đây là config tĩnh (src/config/apps.ts),
    // giờ lấy từ bảng a_app + phân quyền a_app_access (xem AppService, migration
    // 0005_app_registry.sql). Admin thấy hết, người khác chỉ thấy app được cấp.
    async listApps(req, res, next) {
        try {
            res.json(await this.appService.listForUser(req.userId));
        }
        catch (error) {
            next(error);
        }
    }
    async getProfile(req, res, next) {
        try {
            const profile = await this.accountService.getProfile(req.userId);
            if (!profile) {
                res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ.' });
                return;
            }
            res.json(profile);
        }
        catch (error) {
            next(error);
        }
    }
    async updateProfile(req, res, next) {
        try {
            await this.accountService.updateProfile(req.userId, req.body);
            res.json({ success: true, message: 'Đã cập nhật thông tin.' });
        }
        catch (error) {
            next(error);
        }
    }
    async uploadAvatar(req, res, next) {
        try {
            if (!req.file) {
                throw new AppError_1.AppError(400, 'Chưa chọn ảnh.');
            }
            const url = await this.accountService.setAvatar(req.userId, req.file);
            res.json({ success: true, message: 'Đã cập nhật ảnh đại diện.', avatar: url });
        }
        catch (error) {
            next(error);
        }
    }
    async changePassword(req, res, next) {
        try {
            const { oldPassword, newPassword } = req.body;
            await this.accountService.changePassword(req.userId, oldPassword, newPassword);
            res.json({ success: true, message: 'Đã đổi mật khẩu.' });
        }
        catch (error) {
            next(error);
        }
    }
    async listSessions(req, res, next) {
        try {
            const sessions = await this.accountService.listSessions(req.userId, currentSessionId(req));
            res.json(sessions);
        }
        catch (error) {
            next(error);
        }
    }
    async revokeSession(req, res, next) {
        try {
            const { session_id } = req.body;
            await this.accountService.revokeSession(req.userId, session_id, currentSessionId(req));
            res.json({ success: true, message: 'Đã thu hồi phiên đăng nhập.' });
        }
        catch (error) {
            next(error);
        }
    }
};
exports.AccountController = AccountController;
exports.AccountController = AccountController = __decorate([
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [accountService_1.AccountService,
        appService_1.AppService])
], AccountController);
