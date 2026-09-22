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
exports.AppService = void 0;
const tsyringe_1 = require("tsyringe");
const AppError_1 = require("../errors/AppError");
const appRepository_1 = require("../repositories/appRepository");
// Lỗi nghiệp vụ (app_key trùng, không tìm thấy app...) được proc trả qua
// p_error_code/-1 -> Database.query() throw Error(p_error_message). Bắt lại
// ở đây và quy về AppError(400) thay vì để rơi xuống 500 mặc định.
function toAppError(error) {
    if (error instanceof Error)
        return new AppError_1.AppError(400, error.message);
    return new AppError_1.AppError(500, 'Lỗi không xác định.');
}
let AppService = class AppService {
    constructor(appRepository) {
        this.appRepository = appRepository;
    }
    isAdmin(userId) {
        return this.appRepository.isAdmin(userId);
    }
    // Dùng ở GET /me?app=<key> - mọi app tự bảo vệ được, không phải chỉ ẩn/
    // hiện ở trang chủ sso-web (xem technical_decisions.md mục "Enforce quyền
    // app ở /me, không chỉ UI").
    canAccessApp(userId, appKey) {
        return this.appRepository.hasAccessToApp(userId, appKey);
    }
    listForUser(userId) {
        return this.appRepository.listForUser(userId);
    }
    adminList() {
        return this.appRepository.adminList();
    }
    async upsertApp(input, actorUserId) {
        try {
            return await this.appRepository.adminUpsert({
                app_id: input.app_id ?? null,
                app_key: input.app_key,
                app_name: input.app_name,
                description: input.description ?? '',
                url: input.url ?? '',
                color: input.color ?? '#2563a6',
                sort_order: input.sort_order ?? 0,
                lu_user_id: actorUserId,
            });
        }
        catch (error) {
            throw toAppError(error);
        }
    }
    async setAppIcon(appId, icon, actorUserId) {
        try {
            await this.appRepository.adminSetIcon(appId, icon, actorUserId);
        }
        catch (error) {
            throw toAppError(error);
        }
    }
    async deleteApp(appId, actorUserId) {
        try {
            await this.appRepository.adminDelete(appId, actorUserId);
        }
        catch (error) {
            throw toAppError(error);
        }
    }
    listAppAccess(appId) {
        return this.appRepository.adminListAccess(appId);
    }
    async setAppAccess(appId, userIds, actorUserId) {
        try {
            await this.appRepository.adminSetAccess(appId, userIds, actorUserId);
        }
        catch (error) {
            throw toAppError(error);
        }
    }
    async listAppAccessCandidates(appId, filters) {
        try {
            const result = await this.appRepository.adminListAccessCandidates(appId, filters);
            return { rows: result.rows, total: result.record_count };
        }
        catch (error) {
            throw toAppError(error);
        }
    }
    async addAppAccess(appId, userIds, actorUserId) {
        try {
            return await this.appRepository.adminAddAccess(appId, userIds, actorUserId);
        }
        catch (error) {
            throw toAppError(error);
        }
    }
    async removeAppAccess(appId, userIds) {
        try {
            return await this.appRepository.adminRemoveAccess(appId, userIds);
        }
        catch (error) {
            throw toAppError(error);
        }
    }
    listUsers() {
        return this.appRepository.adminListUsers();
    }
    // Endpoint nội bộ: trả về tập con user_id được phép truy cập app_key.
    filterUsersWithAppAccess(appKey, userIds) {
        if (userIds.length === 0)
            return Promise.resolve([]);
        return this.appRepository.filterUsersWithAppAccess(appKey, userIds);
    }
};
exports.AppService = AppService;
exports.AppService = AppService = __decorate([
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [appRepository_1.AppRepository])
], AppService);
