import crypto from 'node:crypto';

import { type NextFunction, type Request, type Response } from 'express';

import { config } from '../config/config';
import { AppError } from '../errors/AppError';

// Bảo vệ /internal/* - api-task-management gọi sang để hỏi quyền app của 1 tập
// user (POST /internal/app-access/filter). KHÔNG dùng requireAuth (JWT người
// dùng cuối) - lúc api-task gọi sang không mang JWT của ai cả, đây là gọi
// server-to-server trong network Docker cô lập (api-sso không publish port ra
// host ở bản production).
//
// Copy nguyên cơ chế từ api-task-management/src/middlewares/internalAuth.ts:
// 1 secret dùng chung qua header X-Internal-Secret, so sánh bằng thời gian
// không đổi. Đây là "defense in depth" CỘNG THÊM lên network isolation, không
// phải mTLS/service-mesh đầy đủ. INTERNAL_SECRET của api-sso PHẢI khớp
// SSO_INTERNAL_SECRET bên api-task.
export function requireInternalSecret(req: Request, _res: Response, next: NextFunction): void {
  const provided = req.header('X-Internal-Secret') ?? '';
  const expected = config.internal.secret;

  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  // timingSafeEqual ném lỗi nếu 2 buffer khác độ dài thay vì trả false - so
  // độ dài trước để tránh crash (độ dài secret không phải thông tin nhạy cảm).
  const ok =
    providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);

  if (!ok) {
    next(new AppError(401, 'Unauthorized'));
    return;
  }
  next();
}
