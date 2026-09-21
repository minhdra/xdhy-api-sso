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
exports.AdminAppController = void 0;
const tsyringe_1 = require("tsyringe");
const appService_1 = require("../services/appService");
let AdminAppController = class AdminAppController {
    constructor(appService) {
        this.appService = appService;
    }
    async listApps(_req, res, next) {
        try {
            res.json(await this.appService.adminList());
        }
        catch (error) {
            next(error);
        }
    }
    async upsertApp(req, res, next) {
        try {
            const input = req.body;
            const result = await this.appService.upsertApp(input, req.userId);
            res.json({ success: true, message: 'Đã lưu ứng dụng.', app_id: result.app_id });
        }
        catch (error) {
            next(error);
        }
    }
    async deleteApp(req, res, next) {
        try {
            const { app_id } = req.body;
            await this.appService.deleteApp(app_id, req.userId);
            res.json({ success: true, message: 'Đã xoá ứng dụng.' });
        }
        catch (error) {
            next(error);
        }
    }
    async listAccess(req, res, next) {
        try {
            const { app_id } = req.params;
            res.json(await this.appService.listAppAccess(app_id));
        }
        catch (error) {
            next(error);
        }
    }
    async setAccess(req, res, next) {
        try {
            const { app_id } = req.params;
            const { user_ids } = req.body;
            await this.appService.setAppAccess(app_id, user_ids, req.userId);
            res.json({ success: true, message: 'Đã cập nhật danh sách người được truy cập.' });
        }
        catch (error) {
            next(error);
        }
    }
    async listAccessCandidates(req, res, next) {
        try {
            const { app_id } = req.params;
            const query = req.query;
            const result = await this.appService.listAppAccessCandidates(app_id, {
                keyword: query.q,
                positionId: query.position_id,
                page: query.page,
                pageSize: query.page_size,
            });
            res.json({ ...result, page: query.page, page_size: query.page_size });
        }
        catch (error) {
            next(error);
        }
    }
    async addAccess(req, res, next) {
        try {
            const { app_id } = req.params;
            const { user_ids } = req.body;
            const affected = await this.appService.addAppAccess(app_id, user_ids, req.userId);
            res.json({ success: true, message: `Đã thêm quyền cho ${affected} người.`, affected });
        }
        catch (error) {
            next(error);
        }
    }
    async removeAccess(req, res, next) {
        try {
            const { app_id } = req.params;
            const { user_ids } = req.body;
            const affected = await this.appService.removeAppAccess(app_id, user_ids);
            res.json({ success: true, message: `Đã gỡ quyền của ${affected} người.`, affected });
        }
        catch (error) {
            next(error);
        }
    }
    async listUsers(_req, res, next) {
        try {
            res.json(await this.appService.listUsers());
        }
        catch (error) {
            next(error);
        }
    }
};
exports.AdminAppController = AdminAppController;
exports.AdminAppController = AdminAppController = __decorate([
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [appService_1.AppService])
], AdminAppController);
