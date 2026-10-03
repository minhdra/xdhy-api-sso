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
exports.AdminOrgController = void 0;
const tsyringe_1 = require("tsyringe");
const AppError_1 = require("../errors/AppError");
const avatarService_1 = require("../services/avatarService");
const orgService_1 = require("../services/orgService");
const syncService_1 = require("../services/syncService");
// Controller mỏng: mọi handler cùng khuôn đọc body -> gọi service -> res.json,
// lỗi đi next() (errorHandler map AppError -> status).
function handle(fn) {
    return async (req, res, next) => {
        try {
            res.json(await fn(req, req.userId));
        }
        catch (error) {
            next(error);
        }
    };
}
const ok = (message, extra = {}) => ({ success: true, message, ...extra });
let AdminOrgController = class AdminOrgController {
    constructor(org, sync, avatar) {
        this.org = org;
        this.sync = sync;
        this.avatar = avatar;
        // ===== Người dùng =====
        this.searchUsers = handle((req) => this.org.searchUsers(req.body));
        this.getUser = handle((req) => this.org.getUser(String(req.params.user_id)));
        this.createUser = handle(async (req, actor) => {
            const input = req.body;
            const userId = await this.org.createUser(input, actor);
            // default_password: có khi dùng mật khẩu mặc định - FE báo lại cho admin.
            const restored = input.deleted_user_action === 'restore';
            return ok(restored ? 'Đã khôi phục người dùng.' : 'Đã thêm người dùng.', {
                restored,
                user_id: userId,
                default_password: input.password ? null : orgService_1.DEFAULT_NEW_PASSWORD,
            });
        });
        this.updateUser = handle(async (req, actor) => {
            await this.org.updateUser(req.body, actor);
            return ok('Đã cập nhật người dùng.');
        });
        this.deleteUsers = handle(async (req, actor) => {
            await this.org.deleteUsers(req.body.user_ids, actor);
            return ok('Đã xoá người dùng.');
        });
        this.lockUser = handle(async (req, actor) => {
            const { user_id, online_flag } = req.body;
            await this.org.lockUser(user_id, online_flag, actor);
            return ok('Đã cập nhật trạng thái người dùng.');
        });
        this.resetPassword = handle(async (req, actor) => ok('Đã đặt lại mật khẩu.', await this.org.resetPassword(req.body.user_id, actor)));
        // multipart field "file" (avatarUpload) - admin đổi avatar hộ user.
        this.setUserAvatar = handle(async (req, actor) => ok('Đã cập nhật ảnh đại diện.', {
            avatar: await this.avatar.replace(String(req.params.user_id), req.file, actor),
        }));
        this.setUserRoles = handle(async (req, actor) => {
            await this.org.setUserRoles(String(req.params.user_id), req.body.role_ids, actor);
            return ok('Đã cập nhật nhóm quyền.');
        });
        // ===== Chi nhánh / phòng ban / chức vụ =====
        this.searchBranches = handle((req) => this.org.searchBranches(req.body));
        this.branchDropdown = handle(() => this.org.branchDropdown());
        this.upsertBranch = handle(async (req, actor) => ok('Đã lưu chi nhánh.', { branch_id: await this.org.upsertBranch(req.body, actor) }));
        this.deleteBranches = handle(async (req, actor) => {
            await this.org.deleteBranches(req.body.ids, actor);
            return ok('Đã xoá chi nhánh.');
        });
        this.searchDepartments = handle((req) => this.org.searchDepartments(req.body));
        this.departmentDropdown = handle(() => this.org.departmentDropdown());
        this.upsertDepartment = handle(async (req, actor) => ok('Đã lưu phòng ban.', {
            department_id: await this.org.upsertDepartment(req.body, actor),
        }));
        this.deleteDepartments = handle(async (req, actor) => {
            await this.org.deleteDepartments(req.body.ids, actor);
            return ok('Đã xoá phòng ban.');
        });
        this.searchPositions = handle((req) => this.org.searchPositions(req.body));
        this.positionDropdown = handle(() => this.org.positionDropdown());
        this.upsertPosition = handle(async (req, actor) => ok('Đã lưu chức vụ.', { position_id: await this.org.upsertPosition(req.body, actor) }));
        this.deletePositions = handle(async (req, actor) => {
            await this.org.deletePositions(req.body.ids, actor);
            return ok('Đã xoá chức vụ.');
        });
        // ===== Nhóm quyền =====
        this.searchRoles = handle((req) => this.org.searchRoles(req.body));
        this.roleDropdown = handle(() => this.org.roleDropdown());
        this.upsertRole = handle(async (req, actor) => ok('Đã lưu nhóm quyền.', { role_id: await this.org.upsertRole(req.body, actor) }));
        this.deleteRoles = handle(async (req, actor) => {
            await this.org.deleteRoles(req.body.role_ids, actor);
            return ok('Đã xoá nhóm quyền.');
        });
        // ===== Đồng bộ =====
        this.syncStatus = handle(async () => ({
            enabled_targets: this.sync.enabledTargets(),
            summary: await this.sync.summary(),
            failed: await this.sync.listFailed(null),
        }));
        this.syncRetry = handle(async (req) => ok('Đã đưa lại vào hàng đợi.', { count: await this.sync.retryFailed(req.body.target ?? null) }));
        this.syncResync = handle(async (req, actor) => {
            const { target } = req.body;
            if (!this.sync.enabledTargets().includes(target)) {
                throw new AppError_1.AppError(400, `Đích "${target}" đang tắt (chưa cấu hình secret).`);
            }
            return ok('Đã xếp hàng đồng bộ lại toàn bộ.', { count: await this.sync.resyncAll(target, actor) });
        });
    }
};
exports.AdminOrgController = AdminOrgController;
exports.AdminOrgController = AdminOrgController = __decorate([
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [orgService_1.OrgService,
        syncService_1.SyncService,
        avatarService_1.AvatarService])
], AdminOrgController);
