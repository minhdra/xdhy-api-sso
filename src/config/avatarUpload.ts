import fs from 'fs';
import path from 'path';

import multer from 'multer';

import { AppError } from '../errors/AppError';

const AVATAR_DIR = 'uploads/avatars';
const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const MAX_BYTES = 5 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });
    cb(null, AVATAR_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED.has(ext)) {
    cb(new AppError(400, 'Chỉ nhận ảnh (jpg, png, gif, webp).'));
    return;
  }
  cb(null, true);
};

// `.single('file')` - client gửi field tên "file".
export const avatarUpload = multer({ storage, fileFilter, limits: { fileSize: MAX_BYTES } }).single(
  'file',
);

// Đường dẫn public để lưu vào user_profiles.avatar + trả về FE. Static serve ở
// app.ts (/api-sso/uploads), gateway rewrite /api/api-sso/uploads/* -> /api-sso/uploads/*.
export const toAvatarUrl = (diskPath: string): string =>
  '/api-sso/' + diskPath.replace(/\\/g, '/');

// Giá trị user_profiles.avatar có 3 dạng:
//   - null / rỗng                         -> null
//   - URL tuyệt đối "http(s)://..."       -> giữ nguyên
//   - "/api-sso/uploads/avatars/x.jpg"    -> avatar do api-sso upload
//   - "uploads\\yyyy-mm-dd\\ten file.png" -> avatar cũ do api-core lưu (backslash,
//                                            tên file có dấu cách / [] ())
// Trả về URL TƯƠNG ĐỐI THEO ORIGIN mà trình duyệt tải được (không hard-code
// domain - chạy đúng trên xdhy.vn, IP, orb.local...). Từng segment path được
// encode để tên file có ký tự đặc biệt không vỡ URL.
// Gateway: /api/api-sso/uploads/*  -> public (ssoApiPipeline, không verify token)
//          /api/api-core/uploads/*  -> public (coreUploadsPipeline, thêm 09/09/2026)
export const toPublicAvatarUrl = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/api/')) return raw; // đã resolve sẵn

  const clean = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  const encoded = clean.split('/').map(encodeURIComponent).join('/');

  // "api-sso/uploads/x" -> "/api/api-sso/uploads/x"; "uploads\yyyy\x" -> "/api/api-core/uploads/x"
  if (encoded.startsWith('api-sso/')) {
    return `/api/${encoded}`;
  }
  return `/api/api-core/${encoded}`;
};
