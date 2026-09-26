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
exports.AccountService = void 0;
const tsyringe_1 = require("tsyringe");
const avatarUpload_1 = require("../config/avatarUpload");
const AppError_1 = require("../errors/AppError");
const coreClient_1 = require("../integrations/coreClient");
const sessionRepository_1 = require("../repositories/sessionRepository");
const userRepository_1 = require("../repositories/userRepository");
const password_1 = require("../utilities/password");
const syncService_1 = require("./syncService");
let AccountService = class AccountService {
    constructor(userRepository, sessionRepository, syncService) {
        this.userRepository = userRepository;
        this.sessionRepository = sessionRepository;
        this.syncService = syncService;
    }
    // Hồ sơ đầy đủ cho trang Quản lý tài khoản (gồm phòng ban/chức vụ/chi nhánh
    // để hiển thị, dù user không sửa được các field đó).
    async getProfile(userId) {
        const profile = await this.userRepository.getAccountProfile(userId);
        if (!profile)
            return profile;
        // avatar: path thô trong DB -> URL trình duyệt tải được (xem toPublicAvatarUrl).
        return { ...profile, avatar: (0, avatarUpload_1.toPublicAvatarUrl)(profile.avatar) };
    }
    // Chỉ đụng vào các field hồ sơ tự phục vụ - proc a_UpdateSelfProfile không
    // chạm branch/department/position/type. Avatar có endpoint upload riêng.
    // Ghi sso_management xong -> outbox đồng bộ user sang các app (SyncService).
    async updateProfile(userId, patch) {
        await this.userRepository.updateSelfProfile({
            user_id: userId,
            full_name: patch.full_name,
            email: patch.email,
            phone_number: patch.phone_number,
            gender: patch.gender,
            date_of_birth: patch.date_of_birth,
            lu_user_id: userId,
        });
        await this.syncService.notify([{ entity: 'user', op: 'upsert', entity_id: userId }], userId);
    }
    // api-core CHỈ lưu file (+ dọn file cũ) rồi trả path thô; ghi
    // user_profiles.avatar ở sso_management (nguồn chính) và đồng bộ user sang
    // các app qua outbox. Trả về URL public của avatar mới để FE cập nhật ngay.
    async setAvatar(userId, file) {
        const avatar = await (0, coreClient_1.uploadAvatar)(userId, file);
        await this.userRepository.setAvatar(userId, avatar, userId);
        await this.syncService.notify([{ entity: 'user', op: 'upsert', entity_id: userId }], userId);
        return (0, avatarUpload_1.toPublicAvatarUrl)(avatar);
    }
    async changePassword(userId, oldPassword, newPassword) {
        const currentHash = await this.userRepository.getPasswordHash(userId);
        if (!currentHash)
            throw new AppError_1.AppError(404, 'Không tìm thấy tài khoản.');
        const ok = await (0, password_1.verifyPassword)(oldPassword, currentHash);
        if (!ok)
            throw new AppError_1.AppError(400, 'Mật khẩu hiện tại không đúng.');
        const newHash = await (0, password_1.hashPassword)(newPassword);
        await this.userRepository.setPassword(userId, newHash, userId);
    }
    async listSessions(userId, currentSessionId) {
        const rows = await this.sessionRepository.listByUser(userId);
        return rows.map((s) => ({ ...s, current: s.session_id === currentSessionId }));
    }
    async revokeSession(userId, sessionId, currentSessionId) {
        if (sessionId === currentSessionId) {
            throw new AppError_1.AppError(400, 'Không thể thu hồi phiên hiện tại - dùng Đăng xuất.');
        }
        const affected = await this.sessionRepository.revokeSessionForUser(sessionId, userId);
        if (affected === 0) {
            throw new AppError_1.AppError(404, 'Phiên không tồn tại hoặc đã bị thu hồi.');
        }
    }
};
exports.AccountService = AccountService;
exports.AccountService = AccountService = __decorate([
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [userRepository_1.UserRepository,
        sessionRepository_1.SessionRepository,
        syncService_1.SyncService])
], AccountService);
