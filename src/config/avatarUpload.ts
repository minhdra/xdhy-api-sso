import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import multer from 'multer';

import { AppError } from '../errors/AppError';

const AVATAR_ROOT = 'uploads/avatars';
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

// Từ 26/09/2026 avatar LƯU Ở api-sso (nguồn chính user) theo format thư mục SSO:
//   uploads/avatars/<username>--<user_id>/<uuid>.<ext>
// DB (user_profiles.avatar) lưu "/api-sso/uploads/avatars/..." - các app nhận
// qua đồng bộ nguyên giá trị này. Giữ ảnh trong bộ nhớ (multer) rồi tự ghi
// file để dùng chung cho user tự đổi (/account/avatar) và admin đổi hộ
// (/admin/org/users/:id/avatar) - chủ thư mục là user ĐƯỢC đổi, không phải
// người thao tác. `.single('file')` - client gửi field tên "file".
export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_BYTES },
}).single('file');

export async function saveAvatarFile(
  owner: { user_id: string; user_name: string },
  file: Express.Multer.File,
): Promise<string> {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED.has(ext)) throw new AppError(400, 'Chỉ nhận ảnh (jpg, png, gif, webp).');
  // encode thành 1 segment - user_id/username không tạo thêm cấp thư mục được.
  const ownerDir = `${encodeURIComponent(owner.user_name.toLowerCase())}--${encodeURIComponent(owner.user_id)}`;
  const dir = path.join(AVATAR_ROOT, ownerDir);
  await fs.mkdir(dir, { recursive: true });
  const diskPath = path.join(dir, `${randomUUID()}${ext}`);
  await fs.writeFile(diskPath, file.buffer);
  return '/api-sso/' + diskPath.split(path.sep).join('/');
}

// Xoá file avatar SSO theo giá trị DB ("/api-sso/uploads/avatars/..."). Bỏ qua
// avatar dạng khác (api-core "uploads\...", URL ngoài) - không thuộc api-sso.
// Không throw: lỗi xoá chỉ log, job dọn orphan (cleanupService) sẽ quét lại.
export async function removeAvatarFile(dbPath: string | null | undefined): Promise<void> {
  if (!dbPath?.startsWith('/api-sso/uploads/avatars/')) return;
  const root = path.resolve(AVATAR_ROOT);
  const target = path.resolve(dbPath.replace(/^\/api-sso\//, ''));
  if (!target.startsWith(root + path.sep)) return;
  await fs.unlink(target).catch((error) => {
    if (error?.code !== 'ENOENT') console.warn('[avatar] không xoá được file cũ:', error.message);
  });
}

// Giá trị user_profiles.avatar có các dạng:
//   - null / rỗng                         -> null
//   - URL tuyệt đối "http(s)://..."       -> giữ nguyên
//   - "/api-sso/uploads/avatars/..."      -> avatar do api-sso lưu (từ 26/09/2026,
//                                            và bản cũ trước 25/09/2026)
//   - "uploads\\yyyy-mm-dd\\ten file-123.png" -> avatar do api-core lưu (giai
//                                            đoạn 25-26/09/2026 + dữ liệu cũ)
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
