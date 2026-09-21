"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const env_1 = __importDefault(require("@ltv/env"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
function requireEnv(key) {
    const value = env_1.default.string(key);
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}
function envBoolean(key, defaultValue) {
    const value = (0, env_1.default)(key, defaultValue ? 'true' : 'false').trim().toLowerCase();
    return value === 'true' || value === '1' || value === 'yes';
}
exports.config = {
    env: (0, env_1.default)('NODE_ENV', 'development'),
    port: env_1.default.int('PORT', 6005),
    cors: {
        origin: (0, env_1.default)('CORS_ORIGIN', 'http://localhost:3010'),
    },
    db: {
        host: requireEnv('DB_HOST'),
        port: env_1.default.int('DB_PORT', 5432),
        username: requireEnv('DB_USERNAME'),
        password: requireEnv('DB_PASSWORD'),
        database: requireEnv('DB_NAME'),
        poolMax: env_1.default.int('DB_POOL_MAX', 5),
        poolMin: env_1.default.int('DB_POOL_MIN', 1),
        queryTimeout: env_1.default.int('DB_QUERY_TIMEOUT', 20000),
    },
    jwt: {
        // RS256: api-sso là nơi DUY NHẤT giữ private key để ký. Các service khác
        // (api-core, api-task-management, api-gateway) chỉ cần public key (qua
        // JWKS endpoint /.well-known/jwks.json) để verify - không còn secret nào
        // phải chia sẻ giữa các service nữa (xem plan mục RS256/JWKS).
        privateKeyPath: requireEnv('JWT_PRIVATE_KEY_PATH'),
        // kid (key id) gắn vào header token + JWKS - cho phép xoay khoá sau này
        // (thêm khoá mới vào JWKS, phát hành token với kid mới, khoá cũ vẫn verify
        // được tới khi hết hạn) mà không cần đổi code, chỉ cần đổi giá trị này.
        kid: (0, env_1.default)('JWT_KID', 'sso-1'),
        // Mặc định khi remember=false (giữ đúng hạn hiện có của api-core).
        // remember=true dùng thẳng hằng số 1d/30d ở controllers/authController.ts,
        // không cần thêm biến môi trường riêng.
        accessExpiresIn: (0, env_1.default)('JWT_ACCESS_EXPIRES_IN', '15m'),
        refreshExpiresIn: (0, env_1.default)('JWT_REFRESH_EXPIRES_IN', '7d'),
    },
    cookie: {
        // Domain cha dùng chung - cho phép cookie set bởi api-sso (ở origin của
        // chính nó, vd trang login) đọc được từ origin của app khác (vd
        // build-web) khi cả 2 cùng nằm dưới domain gốc này. Không set (undefined)
        // = cookie host-only như hiện tại (chỉ đúng 1 origin), vẫn đúng cho luồng
        // build-web proxy /api same-origin qua nginx.
        domain: (0, env_1.default)('COOKIE_DOMAIN', ''),
        // OrbStack (`*.orb.local`) tự cấp HTTPS dù NODE_ENV vẫn là development -
        // cần ép Secure=true trong trường hợp đó (browser bỏ qua Set-Cookie có
        // Secure nếu response tới qua HTTP thường, và ngược lại chấp nhận Secure
        // trên HTTPS bất kể NODE_ENV). Không set -> giữ mặc định cũ
        // (`env === 'production'`).
        secure: (0, env_1.default)('COOKIE_SECURE', ''),
    },
    // Dùng cho "Quên mật khẩu" - copy nguyên convention từ api-core
    // (config/system_email.ts, nodemailer service gmail).
    systemEmail: {
        email: requireEnv('SYSTEM_EMAIL'),
        password: requireEnv('SYSTEM_EMAIL_PASSWORD'),
    },
    // Trang "đổi mật khẩu" (sso-web) - link trong email trỏ về đây kèm ?token=.
    frontendResetUrl: requireEnv('FRONTEND_RESET_URL'),
    rateLimit: {
        windowMs: env_1.default.int('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
        max: env_1.default.int('RATE_LIMIT_MAX', 300),
    },
    bodyLimit: (0, env_1.default)('BODY_LIMIT', '1mb'),
    // Secret dùng chung cho route nội bộ /internal/* (middlewares/internalAuth.ts).
    // api-task-management gọi sang để hỏi quyền app - PHẢI khớp
    // SSO_INTERNAL_SECRET bên api-task.
    internal: {
        secret: requireEnv('INTERNAL_SECRET'),
    },
    // Gọi api-core sau khi user tự sửa hồ sơ/avatar ở sso-web -> api-core lo
    // đồng bộ xuống task + chat + meeting (api-core là nơi duy nhất giữ logic + secret
    // sync đó). KHÔNG requireEnv - thiếu thì bỏ qua (không chặn sửa hồ sơ).
    // CORE_INTERNAL_SECRET phải khớp giá trị cùng tên bên api-core.
    coreInternal: {
        baseUrl: (0, env_1.default)('CORE_INTERNAL_URL', 'http://api-core:6001'),
        secret: (0, env_1.default)('CORE_INTERNAL_SECRET', ''),
    },
    // Dọn các bản ghi xác thực đã hết giá trị sử dụng. Job chỉ đụng 3 bảng
    // riêng của SSO; mặc định giữ thêm một khoảng retention để phục vụ tra soát.
    cleanup: {
        enabled: envBoolean('DATA_CLEANUP_ENABLED', true),
        dryRun: envBoolean('DATA_CLEANUP_DRY_RUN', false),
        intervalMs: env_1.default.int('DATA_CLEANUP_INTERVAL_MS', 24 * 60 * 60 * 1000),
        initialDelayMs: env_1.default.int('DATA_CLEANUP_INITIAL_DELAY_MS', 2 * 60 * 1000),
        batchSize: env_1.default.int('DATA_CLEANUP_BATCH_SIZE', 500),
        maxBatches: env_1.default.int('DATA_CLEANUP_MAX_BATCHES', 20),
        sessionRetentionDays: env_1.default.int('SESSION_RETENTION_DAYS', 30),
        passwordResetRetentionDays: env_1.default.int('PASSWORD_RESET_TOKEN_RETENTION_DAYS', 7),
        orphanAvatarGraceHours: env_1.default.int('ORPHAN_AVATAR_GRACE_HOURS', 24),
        orphanAvatarMaxFilesPerRun: env_1.default.int('ORPHAN_AVATAR_MAX_FILES_PER_RUN', 1000),
    },
};
