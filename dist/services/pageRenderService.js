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
exports.PageRenderService = void 0;
const tsyringe_1 = require("tsyringe");
const config_1 = require("../config/config");
const AppError_1 = require("../errors/AppError");
const brandingRepository_1 = require("../repositories/brandingRepository");
const START = '<!-- branding-meta:start';
const END = '<!-- branding-meta:end -->';
const TEMPLATE_TTL_MS = 5 * 60000;
const esc = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Trả index.html của sso-web với khối thẻ meta/Open Graph lấy từ DB (tab Thương
// hiệu) - để bot xem trước link (Zalo/Facebook, không chạy JS) thấy đúng tên/
// logo của tổ chức mà không phải build lại sso-web (26/09/2026). nginx/IIS của
// sso-web chuyển mọi request trang (không phải file) sang đây; lỗi thì rơi về
// index.html tĩnh.
let PageRenderService = class PageRenderService {
    constructor(branding) {
        this.branding = branding;
        this.template = null;
    }
    async render(path) {
        const html = await this.loadTemplate();
        const row = await this.branding.get();
        if (!row)
            return html;
        const s = html.indexOf(START);
        const e = html.indexOf(END);
        if (s < 0 || e < s)
            return html;
        return html.slice(0, s) + this.metaBlock(row, path) + html.slice(e + END.length);
    }
    async loadTemplate() {
        if (this.template && Date.now() - this.template.at < TEMPLATE_TTL_MS)
            return this.template.html;
        if (!config_1.config.ssoWeb.templateUrl)
            throw new AppError_1.AppError(503, 'Chưa cấu hình SSO_WEB_TEMPLATE_URL.');
        const res = await fetch(config_1.config.ssoWeb.templateUrl, { signal: AbortSignal.timeout(3000) }).catch(() => null);
        if (!res?.ok) {
            // Giữ bản cũ nếu có - sso-web đang deploy lại cũng không làm trang lỗi.
            if (this.template)
                return this.template.html;
            throw new AppError_1.AppError(502, 'Không tải được khuôn trang sso-web.');
        }
        this.template = { at: Date.now(), html: await res.text() };
        return this.template.html;
    }
    metaBlock(b, rawPath) {
        const origin = config_1.config.ssoWeb.publicUrl;
        // Chỉ nhận path nội bộ (bắt đầu "/", không "//") - tránh og:url trỏ domain khác.
        const path = /^\/(?!\/)[^\s"<>]*$/.test(rawPath) ? rawPath : '/';
        const abs = (url, fallback) => {
            const u = url || fallback;
            return /^https?:\/\//.test(u) ? u : `${origin}${u}`;
        };
        const title = `${b.app_name} — ${b.org_name}`;
        const description = b.login_description || b.tagline || `Cổng đăng nhập một lần (SSO) của ${b.org_name}.`;
        const image = abs(b.logo_light, '/logo.png');
        const icons = b.favicon
            ? [`<link rel="icon" href="${esc(b.favicon)}" />`, `<link rel="apple-touch-icon" href="${esc(b.favicon)}" />`]
            : [
                '<link rel="icon" type="image/x-icon" href="/favicon.ico" />',
                '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />',
                '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />',
                '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />',
            ];
        const tags = [
            '<!-- branding-meta: render từ DB (api-sso /render-page) -->',
            ...icons,
            `<title>${esc(title)}</title>`,
            `<meta name="description" content="${esc(description)}" />`,
            `<meta name="application-name" content="${esc(b.short_name)} SSO" />`,
            `<meta name="author" content="${esc(b.org_name)}" />`,
            `<meta name="theme-color" content="${esc(b.primary_color)}" />`,
            '<meta name="robots" content="noindex, nofollow" />',
            '<meta name="format-detection" content="telephone=no" />',
            `<link rel="canonical" href="${esc(origin + path)}" />`,
            '<meta property="og:type" content="website" />',
            `<meta property="og:site_name" content="${esc(b.org_name)}" />`,
            `<meta property="og:title" content="${esc(`Đăng nhập — ${b.org_name}`)}" />`,
            `<meta property="og:description" content="${esc(description)}" />`,
            `<meta property="og:url" content="${esc(origin + path)}" />`,
            `<meta property="og:image" content="${esc(image)}" />`,
            `<meta property="og:image:alt" content="${esc(`${b.org_name} — Cổng đăng nhập`)}" />`,
            '<meta property="og:locale" content="vi_VN" />',
            '<meta name="twitter:card" content="summary_large_image" />',
            `<meta name="twitter:title" content="${esc(`Đăng nhập — ${b.org_name}`)}" />`,
            `<meta name="twitter:description" content="${esc(description)}" />`,
            `<meta name="twitter:image" content="${esc(image)}" />`,
        ];
        return tags.join('\n    ');
    }
};
exports.PageRenderService = PageRenderService;
exports.PageRenderService = PageRenderService = __decorate([
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [brandingRepository_1.BrandingRepository])
], PageRenderService);
