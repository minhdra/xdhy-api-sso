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
exports.AvatarService = void 0;
const tsyringe_1 = require("tsyringe");
const avatarUpload_1 = require("../config/avatarUpload");
const AppError_1 = require("../errors/AppError");
const orgRepository_1 = require("../repositories/orgRepository");
const userRepository_1 = require("../repositories/userRepository");
const syncService_1 = require("./syncService");
// Đổi avatar (user tự đổi ở trang tài khoản hoặc admin đổi hộ ở màn Người
// dùng) - 26/09/2026 lưu file ở api-sso (format thư mục SSO, xem
// config/avatarUpload.ts), ghi sso_management, dọn file cũ, đồng bộ user sang
// các app. Trước đó (25-26/09) chuyển tiếp file sang api-core.
let AvatarService = class AvatarService {
    constructor(orgRepository, userRepository, sync) {
        this.orgRepository = orgRepository;
        this.userRepository = userRepository;
        this.sync = sync;
    }
    async replace(userId, file, actorId) {
        if (!file)
            throw new AppError_1.AppError(400, 'Chưa chọn ảnh.');
        const user = await this.orgRepository.getUserDetail(userId);
        if (!user)
            throw new AppError_1.AppError(404, 'Không tìm thấy người dùng.');
        const avatar = await (0, avatarUpload_1.saveAvatarFile)({ user_id: user.user_id, user_name: user.user_name }, file);
        try {
            await this.userRepository.setAvatar(userId, avatar, actorId);
        }
        catch (error) {
            await (0, avatarUpload_1.removeAvatarFile)(avatar);
            throw error;
        }
        if (user.avatar !== avatar)
            await (0, avatarUpload_1.removeAvatarFile)(user.avatar);
        await this.sync.notify([{ entity: 'user', op: 'upsert', entity_id: userId }], actorId);
        return (0, avatarUpload_1.toPublicAvatarUrl)(avatar);
    }
};
exports.AvatarService = AvatarService;
exports.AvatarService = AvatarService = __decorate([
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [orgRepository_1.OrgRepository,
        userRepository_1.UserRepository,
        syncService_1.SyncService])
], AvatarService);
