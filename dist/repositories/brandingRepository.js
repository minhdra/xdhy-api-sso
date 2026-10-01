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
exports.BrandingRepository = exports.BRANDING_IMAGE_KINDS = void 0;
const tsyringe_1 = require("tsyringe");
const database_1 = require("../config/database");
exports.BRANDING_IMAGE_KINDS = ['logo_light', 'logo_dark', 'favicon', 'login_background'];
// Bảng a_org_setting (db/sso_management/0007) - bảng riêng api-sso, 1 dòng,
// thao tác SQL thuần như a_session.
let BrandingRepository = class BrandingRepository {
    constructor(db) {
        this.db = db;
    }
    async get() {
        const rows = await this.db.raw(`SELECT org_name, short_name, app_name, tagline, login_heading, login_description, primary_color,
              footer_text, footer_links, logo_light, logo_dark, favicon, login_background, lu_updated
       FROM a_org_setting WHERE id = 1`);
        return rows[0] ?? null;
    }
    async updateText(t, actor) {
        await this.db.raw(`UPDATE a_org_setting SET org_name = $1, short_name = $2, app_name = $3, tagline = $4,
              login_heading = $5, login_description = $6, primary_color = $7, footer_text = $8,
              footer_links = $9::jsonb, lu_user_id = $10, lu_updated = now()
       WHERE id = 1`, [
            t.org_name,
            t.short_name,
            t.app_name,
            t.tagline,
            t.login_heading,
            t.login_description,
            t.primary_color,
            t.footer_text,
            JSON.stringify(t.footer_links),
            actor,
        ]);
    }
    // kind lấy từ whitelist BRANDING_IMAGE_KINDS (không phải input thô) nên
    // ghép tên cột an toàn.
    async setImage(kind, value, actor) {
        if (!exports.BRANDING_IMAGE_KINDS.includes(kind))
            throw new Error('kind không hợp lệ');
        await this.db.raw(`UPDATE a_org_setting SET ${kind} = $1, lu_user_id = $2, lu_updated = now() WHERE id = 1`, [value, actor]);
    }
};
exports.BrandingRepository = BrandingRepository;
exports.BrandingRepository = BrandingRepository = __decorate([
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [database_1.Database])
], BrandingRepository);
