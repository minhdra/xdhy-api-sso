import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

import { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { container } from 'tsyringe';

import { AppError } from '../errors/AppError';
import { UserRepository } from '../repositories/userRepository';

const AVATAR_ROOT = 'uploads/avatars';
const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const MAX_BYTES = 5 * 1024 * 1024;
const userRepository = container.resolve(UserRepository);

// multer chọn destination trước controller. Resolve username sau requireAuth
// để thư mục đọc được nhưng vẫn gắn user_id bất biến nhằm tránh trùng/đổi tên.
export const resolveAvatarUploadOwner = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError(401, 'Chưa đăng nhập.');
    const account = await userRepository.getUsernameEmailById(userId);
    if (!account) throw new AppError(404, 'Không tìm thấy tài khoản.');
    req.avatarUsername = account.user_name;
    next();
  } catch (error) {
    next(error);
  }
};

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    // Route đã qua requireAuth trước multer. Encode thành 1 segment để user_id
    // không thể tạo thêm cấp thư mục dù sau này format ID thay đổi.
    const userId = req.userId;
    const username = req.avatarUsername;
    if (!userId || !username) {
      cb(new AppError(401, 'Chưa đăng nhập.'), '');
      return;
    }
    const ownerDir = `${encodeURIComponent(username.toLowerCase())}--${encodeURIComponent(userId)}`;
    const avatarDir = path.join(AVATAR_ROOT, ownerDir);
    if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });
    cb(null, avatarDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
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
//   - "/api-sso/uploads/avatars/<user_id>/<uuid>.jpg" -> avatar do api-sso upload
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
