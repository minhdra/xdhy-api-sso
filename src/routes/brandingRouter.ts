import { type NextFunction, type Request, type Response, Router } from 'express';
import multer from 'multer';
import { container } from 'tsyringe';

import { requireAuth } from '../middlewares/auth';
import { requireAdmin } from '../middlewares/requireAdmin';
import { defineRoute } from '../openapi/defineRoute';
import { type BrandingImageKind } from '../repositories/brandingRepository';
import {
  brandingKindParamSchema,
  type UpdateBrandingInput,
  updateBrandingSchema,
} from '../schemas/branding.schema';
import { BrandingService } from '../services/brandingService';
import { PageRenderService } from '../services/pageRenderService';

// Thương hiệu SSO (tên tổ chức, logo, màu, footer...) - 26/09/2026.
// GET /branding công khai (trang đăng nhập cần trước khi có phiên); sửa chỉ admin.
const brandingRouter = Router();
const service = container.resolve(BrandingService);
const pageRender = container.resolve(PageRenderService);
const tags = ['Branding'];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('file');

const wrap =
  (fn: (req: Request) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await fn(req));
    } catch (error) {
      next(error);
    }
  };

brandingRouter.get(
  '/branding',
  ...defineRoute({
    method: 'get',
    path: '/branding',
    tags,
    summary: 'Thông tin thương hiệu (công khai) - ảnh đã là URL tải được',
    responses: { 200: { description: 'OK' } },
  }),
  (_req, res, next) => {
    // Cache ngắn ở trình duyệt/proxy - đổi xong tối đa 1 phút mới thấy ở tab khác.
    res.setHeader('Cache-Control', 'public, max-age=60');
    next();
  },
  wrap(() => service.getPublic()),
);

// index.html của sso-web kèm meta/Open Graph từ DB - nginx/IIS của sso-web gọi
// cho mọi request trang (không phải file tĩnh). ?path= là đường dẫn gốc.
brandingRouter.get('/render-page', async (req, res, next) => {
  try {
    // Đường dẫn gốc: ?path= (IIS - có UrlEncode) hoặc header X-Original-Path (nginx).
    const path =
      typeof req.query.path === 'string' ? req.query.path : (req.get('x-original-path') ?? '/');
    const html = await pageRender.render(path);
    // Đây là trang của sso-web, không phải API - bỏ CSP/COEP helmet gắn cho API
    // (CSP đó chặn script inline trong index.html). Header bảo mật của trang do
    // nginx/IIS sso-web quyết định như khi phục vụ file tĩnh.
    ['Content-Security-Policy', 'Cross-Origin-Embedder-Policy', 'Cross-Origin-Resource-Policy'].forEach((h) =>
      res.removeHeader(h),
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Giống index.html tĩnh - không cache (bundle đổi theo mỗi lần deploy).
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(html);
  } catch (error) {
    next(error);
  }
});

brandingRouter.use('/admin/branding', requireAuth, requireAdmin);

brandingRouter.put(
  '/admin/branding',
  ...defineRoute({
    method: 'put',
    path: '/admin/branding',
    tags,
    summary: 'Sửa thông tin chữ + màu + link footer',
    schema: { body: updateBrandingSchema },
    responses: { 200: { description: 'OK' }, 403: { description: 'Không phải quản trị viên' } },
  }),
  wrap(async (req) => {
    await service.updateText(req.body as UpdateBrandingInput, req.userId as string);
    return { success: true, message: 'Đã lưu thông tin tổ chức.' };
  }),
);

brandingRouter.post(
  '/admin/branding/:kind',
  ...defineRoute({
    method: 'post',
    path: '/admin/branding/{kind}',
    tags,
    summary: 'Tải ảnh (logo_light | logo_dark | favicon | login_background), multipart field "file"',
    schema: { params: brandingKindParamSchema },
    responses: { 200: { description: 'OK' }, 400: { description: 'Ảnh không hợp lệ' } },
  }),
  upload,
  wrap(async (req) => ({
    success: true,
    url: await service.setImage(req.params.kind as BrandingImageKind, req.file, req.userId as string),
  })),
);

brandingRouter.delete(
  '/admin/branding/:kind',
  ...defineRoute({
    method: 'delete',
    path: '/admin/branding/{kind}',
    tags,
    summary: 'Về ảnh mặc định',
    schema: { params: brandingKindParamSchema },
    responses: { 200: { description: 'OK' } },
  }),
  wrap(async (req) => {
    await service.resetImage(req.params.kind as BrandingImageKind, req.userId as string);
    return { success: true };
  }),
);

export default brandingRouter;
