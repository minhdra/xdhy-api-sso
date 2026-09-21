"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPublicAvatarUrl = exports.toAvatarUrl = exports.avatarUpload = exports.resolveAvatarUploadOwner = void 0;
const crypto_1 = require("crypto");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
const tsyringe_1 = require("tsyringe");
const AppError_1 = require("../errors/AppError");
const userRepository_1 = require("../repositories/userRepository");
const AVATAR_ROOT = 'uploads/avatars';
const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const MAX_BYTES = 5 * 1024 * 1024;
const userRepository = tsyringe_1.container.resolve(userRepository_1.UserRepository);
// multer chọn destination trước controller. Resolve username sau requireAuth
// để thư mục đọc được nhưng vẫn gắn user_id bất biến nhằm tránh trùng/đổi tên.
const resolveAvatarUploadOwner = async (req, _res, next) => {
    try {
        const userId = req.userId;
        if (!userId)
            throw new AppError_1.AppError(401, 'Chưa đăng nhập.');
        const account = await userRepository.getUsernameEmailById(userId);
        if (!account)
            throw new AppError_1.AppError(404, 'Không tìm thấy tài khoản.');
        req.avatarUsername = account.user_name;
        next();
    }
    catch (error) {
        next(error);
    }
};
exports.resolveAvatarUploadOwner = resolveAvatarUploadOwner;
const storage = multer_1.default.diskStorage({
    destination: (req, _file, cb) => {
        // Route đã qua requireAuth trước multer. Encode thành 1 segment để user_id
        // không thể tạo thêm cấp thư mục dù sau này format ID thay đổi.
        const userId = req.userId;
        const username = req.avatarUsername;
        if (!userId || !username) {
            cb(new AppError_1.AppError(401, 'Chưa đăng nhập.'), '');
            return;
        }
        const ownerDir = `${encodeURIComponent(username.toLowerCase())}--${encodeURIComponent(userId)}`;
        const avatarDir = path_1.default.join(AVATAR_ROOT, ownerDir);
        if (!fs_1.default.existsSync(avatarDir))
            fs_1.default.mkdirSync(avatarDir, { recursive: true });
        cb(null, avatarDir);
    },
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        cb(null, `${(0, crypto_1.randomUUID)()}${ext}`);
    },
});
const fileFilter = (_req, file, cb) => {
    const ext = path_1.default.extname(file.originalname).toLowerCase();
    if (!ALLOWED.has(ext)) {
        cb(new AppError_1.AppError(400, 'Chỉ nhận ảnh (jpg, png, gif, webp).'));
        return;
    }
    cb(null, true);
};
// `.single('file')` - client gửi field tên "file".
exports.avatarUpload = (0, multer_1.default)({ storage, fileFilter, limits: { fileSize: MAX_BYTES } }).single('file');
// Đường dẫn public để lưu vào user_profiles.avatar + trả về FE. Static serve ở
// app.ts (/api-sso/uploads), gateway rewrite /api/api-sso/uploads/* -> /api-sso/uploads/*.
const toAvatarUrl = (diskPath) => '/api-sso/' + diskPath.replace(/\\/g, '/');
exports.toAvatarUrl = toAvatarUrl;
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
const toPublicAvatarUrl = (raw) => {
    if (!raw)
        return null;
    if (/^https?:\/\//i.test(raw))
        return raw;
    if (raw.startsWith('/api/'))
        return raw; // đã resolve sẵn
    const clean = raw.replace(/\\/g, '/').replace(/^\/+/, '');
    const encoded = clean.split('/').map(encodeURIComponent).join('/');
    // "api-sso/uploads/x" -> "/api/api-sso/uploads/x"; "uploads\yyyy\x" -> "/api/api-core/uploads/x"
    if (encoded.startsWith('api-sso/')) {
        return `/api/${encoded}`;
    }
    return `/api/api-core/${encoded}`;
};
exports.toPublicAvatarUrl = toPublicAvatarUrl;
