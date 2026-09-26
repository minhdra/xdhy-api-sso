"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const tsyringe_1 = require("tsyringe");
const auth_1 = require("../middlewares/auth");
const requireAdmin_1 = require("../middlewares/requireAdmin");
const defineRoute_1 = require("../openapi/defineRoute");
const branding_schema_1 = require("../schemas/branding.schema");
const brandingService_1 = require("../services/brandingService");
const pageRenderService_1 = require("../services/pageRenderService");
// Thương hiệu SSO (tên tổ chức, logo, màu, footer...) - 26/09/2026.
// GET /branding công khai (trang đăng nhập cần trước khi có phiên); sửa chỉ admin.
const brandingRouter = (0, express_1.Router)();
const service = tsyringe_1.container.resolve(brandingService_1.BrandingService);
const pageRender = tsyringe_1.container.resolve(pageRenderService_1.PageRenderService);
const tags = ['Branding'];
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('file');
const wrap = (fn) => async (req, res, next) => {
    try {
        res.json(await fn(req));
    }
    catch (error) {
        next(error);
    }
};
brandingRouter.get('/branding', ...(0, defineRoute_1.defineRoute)({
    method: 'get',
    path: '/branding',
    tags,
    summary: 'Thông tin thương hiệu (công khai) - ảnh đã là URL tải được',
    responses: { 200: { description: 'OK' } },
}), (_req, res, next) => {
    // Cache ngắn ở trình duyệt/proxy - đổi xong tối đa 1 phút mới thấy ở tab khác.
    res.setHeader('Cache-Control', 'public, max-age=60');
    next();
}, wrap(() => service.getPublic()));
// index.html của sso-web kèm meta/Open Graph từ DB - nginx/IIS của sso-web gọi
// cho mọi request trang (không phải file tĩnh). ?path= là đường dẫn gốc.
brandingRouter.get('/render-page', async (req, res, next) => {
    try {
        // Đường dẫn gốc: ?path= (IIS - có UrlEncode) hoặc header X-Original-Path (nginx).
        const path = typeof req.query.path === 'string' ? req.query.path : (req.get('x-original-path') ?? '/');
        const html = await pageRender.render(path);
        // Đây là trang của sso-web, không phải API - bỏ CSP/COEP helmet gắn cho API
        // (CSP đó chặn script inline trong index.html). Header bảo mật của trang do
        // nginx/IIS sso-web quyết định như khi phục vụ file tĩnh.
        ['Content-Security-Policy', 'Cross-Origin-Embedder-Policy', 'Cross-Origin-Resource-Policy'].forEach((h) => res.removeHeader(h));
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        // Giống index.html tĩnh - không cache (bundle đổi theo mỗi lần deploy).
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(html);
    }
    catch (error) {
        next(error);
    }
});
brandingRouter.use('/admin/branding', auth_1.requireAuth, requireAdmin_1.requireAdmin);
brandingRouter.put('/admin/branding', ...(0, defineRoute_1.defineRoute)({
    method: 'put',
    path: '/admin/branding',
    tags,
    summary: 'Sửa thông tin chữ + màu + link footer',
    schema: { body: branding_schema_1.updateBrandingSchema },
    responses: { 200: { description: 'OK' }, 403: { description: 'Không phải quản trị viên' } },
}), wrap(async (req) => {
    await service.updateText(req.body, req.userId);
    return { success: true, message: 'Đã lưu thông tin tổ chức.' };
}));
brandingRouter.post('/admin/branding/:kind', ...(0, defineRoute_1.defineRoute)({
    method: 'post',
    path: '/admin/branding/{kind}',
    tags,
    summary: 'Tải ảnh (logo_light | logo_dark | favicon | login_background), multipart field "file"',
    schema: { params: branding_schema_1.brandingKindParamSchema },
    responses: { 200: { description: 'OK' }, 400: { description: 'Ảnh không hợp lệ' } },
}), upload, wrap(async (req) => ({
    success: true,
    url: await service.setImage(req.params.kind, req.file, req.userId),
})));
brandingRouter.delete('/admin/branding/:kind', ...(0, defineRoute_1.defineRoute)({
    method: 'delete',
    path: '/admin/branding/{kind}',
    tags,
    summary: 'Về ảnh mặc định',
    schema: { params: branding_schema_1.brandingKindParamSchema },
    responses: { 200: { description: 'OK' } },
}), wrap(async (req) => {
    await service.resetImage(req.params.kind, req.userId);
    return { success: true };
}));
exports.default = brandingRouter;
