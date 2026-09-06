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
// app.ts (/api-sso/uploads), gateway rewrite /api/sso/uploads/* -> /api-sso/uploads/*.
export const toAvatarUrl = (diskPath: string): string =>
  '/api-sso/' + diskPath.replace(/\\/g, '/');
