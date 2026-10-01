"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPublicAvatarUrl = exports.avatarUpload = void 0;
exports.saveAvatarFile = saveAvatarFile;
exports.removeAvatarFile = removeAvatarFile;
const crypto_1 = require("crypto");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
const AppError_1 = require("../errors/AppError");
const AVATAR_ROOT = 'uploads/avatars';
const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const MAX_BYTES = 5 * 1024 * 1024;
const fileFilter = (_req, file, cb) => {
    const ext = path_1.default.extname(file.originalname).toLowerCase();
    if (!ALLOWED.has(ext)) {
        cb(new AppError_1.AppError(400, 'Chỉ nhận ảnh (jpg, png, gif, webp).'));
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
exports.avatarUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    fileFilter,
    limits: { fileSize: MAX_BYTES },
}).single('file');
async function saveAvatarFile(owner, file) {
    const ext = path_1.default.extname(file.originalname).toLowerCase();
    if (!ALLOWED.has(ext))
        throw new AppError_1.AppError(400, 'Chỉ nhận ảnh (jpg, png, gif, webp).');
    // encode thành 1 segment - user_id/username không tạo thêm cấp thư mục được.
    const ownerDir = `${encodeURIComponent(owner.user_name.toLowerCase())}--${encodeURIComponent(owner.user_id)}`;
    const dir = path_1.default.join(AVATAR_ROOT, ownerDir);
    await promises_1.default.mkdir(dir, { recursive: true });
    const diskPath = path_1.default.join(dir, `${(0, crypto_1.randomUUID)()}${ext}`);
    await promises_1.default.writeFile(diskPath, file.buffer);
    return '/api-sso/' + diskPath.split(path_1.default.sep).join('/');
}
// Xoá file avatar SSO theo giá trị DB ("/api-sso/uploads/avatars/..."). Bỏ qua
// avatar dạng khác (api-core "uploads\...", URL ngoài) - không thuộc api-sso.
// Không throw: lỗi xoá chỉ log, job dọn orphan (cleanupService) sẽ quét lại.
async function removeAvatarFile(dbPath) {
    if (!dbPath?.startsWith('/api-sso/uploads/avatars/'))
        return;
    const root = path_1.default.resolve(AVATAR_ROOT);
    const target = path_1.default.resolve(dbPath.replace(/^\/api-sso\//, ''));
    if (!target.startsWith(root + path_1.default.sep))
        return;
    await promises_1.default.unlink(target).catch((error) => {
        if (error?.code !== 'ENOENT')
            console.warn('[avatar] không xoá được file cũ:', error.message);
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
const toPublicAvatarUrl = (raw) => {
    if (!raw)
        return null;
    if (/^https?:\/\//i.test(raw))
        return raw;
    if (raw.startsWith('/api/'))
        return raw; // đã resolve sẵn
    const clean = raw.replace(/\\/g, '/').replace(/^\/+/, '');
    const encoded = clean.split('/').map(encodeURIComponent).join('/');
    // "api-sso/uploads/x" -> "/api/api-sso/uploads/x"; "uploads/x" -> "/api/api-core/uploads/x"
    if (encoded.startsWith('api-sso/')) {
        return `/api/${encoded}`;
    }
    return `/api/api-core/${encoded}`;
};
exports.toPublicAvatarUrl = toPublicAvatarUrl;
