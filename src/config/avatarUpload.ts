import path from 'path';

import multer from 'multer';

import { AppError } from '../errors/AppError';

const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const MAX_BYTES = 5 * 1024 * 1024;

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED.has(ext)) {
    cb(new AppError(400, 'Chỉ nhận ảnh (jpg, png, gif, webp).'));
    return;
  }
  cb(null, true);
};

// Từ 25/09/2026 api-sso KHÔNG lưu file avatar nữa: giữ ảnh trong bộ nhớ rồi
// chuyển tiếp sang api-core (integrations/coreClient.ts uploadAvatar) - api-core
// là nơi duy nhất lưu file vật lý + ghi user_profiles.avatar, để mọi app đọc
// cùng 1 dạng path "uploads/yyyy-mm-dd/..." của api-core. `.single('file')` - client gửi field
// tên "file".
export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_BYTES },
}).single('file');

// Giá trị user_profiles.avatar có các dạng:
//   - null / rỗng                         -> null
//   - URL tuyệt đối "http(s)://..."       -> giữ nguyên
//   - "uploads\\yyyy-mm-dd\\ten file-123.png" -> avatar do api-core lưu (UploadService,
//                                            backslash trên Windows, tên file có dấu cách / [] ())
//   - "/api-sso/uploads/avatars/..."      -> avatar CŨ api-sso tự lưu (trước
//                                            25/09/2026), vẫn serve để tương thích
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

  // "api-sso/uploads/x" -> "/api/api-sso/uploads/x"; "uploads/x" -> "/api/api-core/uploads/x"
  if (encoded.startsWith('api-sso/')) {
    return `/api/${encoded}`;
  }
  return `/api/api-core/${encoded}`;
};
