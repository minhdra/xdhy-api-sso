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
exports.AdminSessionController = void 0;
const tsyringe_1 = require("tsyringe");
const adminSessionService_1 = require("../services/adminSessionService");
const accountController_1 = require("./accountController");
let AdminSessionController = class AdminSessionController {
    constructor(service) {
        this.service = service;
    }
    async list(req, res, next) {
        try {
            const query = req.query;
            res.json(await this.service.list({ q: query.q, page: query.page, pageSize: query.page_size }, (0, accountController_1.currentSessionId)(req)));
        }
        catch (error) {
            next(error);
        }
    }
    async revoke(req, res, next) {
        try {
            const { session_id } = req.body;
            await this.service.revoke(session_id, (0, accountController_1.currentSessionId)(req));
            res.json({ success: true, message: 'Đã thu hồi phiên.' });
        }
        catch (error) {
            next(error);
        }
    }
    async revokeUser(req, res, next) {
        try {
            const { user_id } = req.body;
            await this.service.revokeUser(user_id, req.userId);
            res.json({ success: true, message: 'Đã thu hồi mọi phiên của người dùng.' });
        }
        catch (error) {
            next(error);
        }
    }
};
exports.AdminSessionController = AdminSessionController;
exports.AdminSessionController = AdminSessionController = __decorate([
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [adminSessionService_1.AdminSessionService])
], AdminSessionController);
