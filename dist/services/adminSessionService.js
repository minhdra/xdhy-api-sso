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
exports.AdminSessionService = void 0;
const tsyringe_1 = require("tsyringe");
const AppError_1 = require("../errors/AppError");
const sessionRepository_1 = require("../repositories/sessionRepository");
// Quản trị xem/thu hồi phiên đăng nhập của mọi người (20/10/2026). Phiên đang
// gọi và tài khoản của chính admin không thu hồi được ở đây - dùng Đăng xuất /
// tab "Của tôi", tránh tự đá mình ra.
let AdminSessionService = class AdminSessionService {
    constructor(sessions) {
        this.sessions = sessions;
    }
    async list(params, currentSessionId) {
        const { rows, total } = await this.sessions.listActiveAll({
            q: params.q,
            limit: params.pageSize,
            offset: (params.page - 1) * params.pageSize,
        });
        return {
            items: rows.map((s) => ({ ...s, current: s.session_id === currentSessionId })),
            total,
            page: params.page,
            page_size: params.pageSize,
        };
    }
    async revoke(sessionId, currentSessionId) {
        if (sessionId === currentSessionId) {
            throw new AppError_1.AppError(400, 'Không thể thu hồi phiên hiện tại - dùng Đăng xuất.');
        }
        const affected = await this.sessions.revokeSessionAny(sessionId);
        if (affected === 0)
            throw new AppError_1.AppError(404, 'Phiên không tồn tại hoặc đã bị thu hồi.');
    }
    async revokeUser(userId, actorId) {
        if (userId === actorId) {
            throw new AppError_1.AppError(400, 'Không thể thu hồi toàn bộ phiên của chính bạn - dùng Đăng xuất.');
        }
        await this.sessions.revokeAllForUser(userId);
    }
};
exports.AdminSessionService = AdminSessionService;
exports.AdminSessionService = AdminSessionService = __decorate([
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [sessionRepository_1.SessionRepository])
], AdminSessionService);
