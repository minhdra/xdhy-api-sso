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
exports.AppRepository = void 0;
const tsyringe_1 = require("tsyringe");
const database_1 = require("../config/database");
// Mọi thao tác ở đây chỉ CALL stored procedure (0005_app_registry.sql) -
// không viết SQL nghiệp vụ ở tầng TypeScript, theo đúng quy ước của DB này.
let AppRepository = class AppRepository {
    constructor(db) {
        this.db = db;
    }
    async isAdmin(userId) {
        const rows = await this.db.raw(`SELECT "a_IsUserAdmin"($1) AS v`, [userId]);
        return Boolean(rows[0]?.v);
    }
    // Cổng chặn thật ở backend (không chỉ ẩn/hiện UI) - app nào gọi GET
    // /me?app=<key> đều tự bảo vệ được bằng 1 hàm này. Admin luôn true, app_key
    // sai/không active luôn false cho non-admin (fail-closed) - logic nằm
    // trong DB (a_UserHasAppAccess), không lặp lại ở TS.
    async hasAccessToApp(userId, appKey) {
        const rows = await this.db.raw(`SELECT "a_UserHasAppAccess"($1, $2) AS v`, [userId, appKey]);
        return Boolean(rows[0]?.v);
    }
    async listForUser(userId) {
        const result = await this.db.queryList(`CALL "a_ListAppsForUser"($1, NULL, NULL, NULL)`, [userId]);
        return result.rows;
    }
    async adminList() {
        const result = await this.db.queryList(`CALL "a_AdminListApps"(NULL, NULL, NULL)`, []);
        return result.rows;
    }
    async adminUpsert(app) {
        return this.db.query(`CALL "a_AdminUpsertApp"($1,$2,$3,$4,$5,$6,$7,$8,NULL,NULL,NULL)`, [
            app.app_id,
            app.app_key,
            app.app_name,
            app.description,
            app.url,
            app.color,
            app.sort_order,
            app.lu_user_id,
        ]);
    }
    async adminDelete(appId, luUserId) {
        await this.db.query(`CALL "a_AdminDeleteApp"($1, $2, NULL, NULL, NULL)`, [appId, luUserId]);
    }
    async adminListAccess(appId) {
        const result = await this.db.queryList(`CALL "a_AdminListAppAccess"($1, NULL, NULL, NULL)`, [appId]);
        return result.rows;
    }
    async adminSetAccess(appId, userIds, luUserId) {
        await this.db.query(`CALL "a_AdminSetAppAccess"($1, $2::jsonb, $3, NULL, NULL, NULL)`, [appId, JSON.stringify(userIds), luUserId]);
    }
    async adminListAccessCandidates(appId, filters) {
        const result = await this.db.queryList(`CALL "a_AdminListAppAccessCandidates"($1, $2, $3, $4, $5, NULL, NULL, NULL)`, [appId, filters.keyword, filters.positionId ?? null, filters.page, filters.pageSize]);
        return { rows: result.rows, record_count: result.record_count };
    }
    async adminAddAccess(appId, userIds, luUserId) {
        const result = await this.db.query(`CALL "a_AdminAddAppAccess"($1, $2::jsonb, $3, NULL, NULL, NULL)`, [appId, JSON.stringify(userIds), luUserId]);
        return Number(result?.affected ?? 0);
    }
    async adminRemoveAccess(appId, userIds) {
        const result = await this.db.query(`CALL "a_AdminRemoveAppAccess"($1, $2::jsonb, NULL, NULL, NULL)`, [appId, JSON.stringify(userIds)]);
        return Number(result?.affected ?? 0);
    }
    async adminListUsers() {
        const result = await this.db.queryList(`CALL "a_AdminListUsers"(NULL, NULL, NULL)`, []);
        return result.rows;
    }
    // Lọc 1 tập user_id, trả về những người được phép truy cập app_key (gồm cả
    // admin bypass) - dùng ở endpoint nội bộ POST /internal/app-access/filter.
    // a_FilterUsersWithAppAccess (0009) chỉ bọc lại a_UserHasAppAccess, không
    // lặp logic phân quyền ở TS.
    async filterUsersWithAppAccess(appKey, userIds) {
        const rows = await this.db.raw(`SELECT user_id FROM "a_FilterUsersWithAppAccess"($1, $2::jsonb)`, [appKey, JSON.stringify(userIds)]);
        return rows.map((r) => String(r.user_id));
    }
};
exports.AppRepository = AppRepository;
exports.AppRepository = AppRepository = __decorate([
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [database_1.Database])
], AppRepository);
