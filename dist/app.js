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
require("reflect-metadata");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const express_rate_limit_1 = __importStar(require("express-rate-limit"));
const helmet_1 = __importDefault(require("helmet"));
const config_1 = require("./config/config");
const jwt_1 = require("./config/jwt");
const errorHandler_1 = require("./errors/errorHandler");
const internalAuth_1 = require("./middlewares/internalAuth");
const requestContext_1 = require("./middlewares/requestContext");
const internalRouter_1 = __importDefault(require("./routes/internalRouter"));
const routes_1 = __importDefault(require("./routes"));
const app = (0, express_1.default)();
// Request chain giống api-core: nginx/gateway -> service = tối đa 2 hop.
app.set('trust proxy', 2);
app.use((0, helmet_1.default)());
app.use(requestContext_1.requestContext);
app.use((0, cors_1.default)({
    origin: config_1.config.cors.origin === '*' ? true : config_1.config.cors.origin.split(',').map((o) => o.trim()),
    credentials: true,
}));
app.use((0, cookie_parser_1.default)());
// IIS/ARR ở deploy thật có thể ghi X-Forwarded-For dạng "ip:port" (đã gặp
// req.ip = "117.7.137.54:64477") khiến express-rate-limit v8 ném
// ERR_ERL_INVALID_IP_ADDRESS. Bóc phần ":port" trước khi tạo key, rồi đưa qua
// ipKeyGenerator để chuẩn hoá IPv6 (gộp /64) cho an toàn.
const stripPort = (ip) => {
    if (!ip)
        return ip;
    if (ip.startsWith('[')) {
        const end = ip.indexOf(']');
        return end > 0 ? ip.slice(1, end) : ip;
    }
    const parts = ip.split(':');
    return parts.length === 2 ? parts[0] : ip;
};
const clientIpKey = (req) => (0, express_rate_limit_1.ipKeyGenerator)(stripPort(req.ip ?? ''));
app.use((0, express_rate_limit_1.default)({
    windowMs: config_1.config.rateLimit.windowMs,
    limit: config_1.config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: clientIpKey,
    // Bỏ đếm cho các route hạ tầng gọi server-to-server: api-gateway gọi
    // /session/validate MỖI request có auth của MỌI service -> tất cả chung
    // 1 key (IP gateway) -> ăn hết quota, user thật bị 429 oan. Tương tự
    // /internal/* (api-task gọi), JWKS, ảnh tĩnh. Limiter chỉ nên chặn abuse
    // từ trình duyệt (login, quên mật khẩu, /me...).
    skip: (req) => req.path === '/api-sso/session/validate' ||
        req.path.startsWith('/internal/') ||
        req.path.startsWith('/api-sso/uploads/') ||
        req.path === '/.well-known/jwks.json',
}));
app.use(express_1.default.json({ limit: config_1.config.bodyLimit }));
app.use(express_1.default.urlencoded({ extended: true, limit: config_1.config.bodyLimit }));
// Đường dẫn chuẩn cho JWKS (RFC 8615 well-known URI) - đặt ở gốc domain của
// api-sso, không phải dưới /api-sso, để khớp quy ước OIDC discovery mà các
// thư viện verify JWKS (jwks-rsa...) đều mong đợi.
app.get('/.well-known/jwks.json', (_req, res) => {
    res.json({ keys: [(0, jwt_1.getJwk)()] });
});
// Ảnh đại diện user upload (multer ghi vào uploads/avatars/<user_id>/). Gateway rewrite
// /api/api-sso/uploads/* -> /api-sso/uploads/*. Không cần auth để xem ảnh.
app.use('/api-sso/uploads', express_1.default.static('uploads'));
// Route nội bộ server-to-server (api-task-management gọi sang). Đặt NGOÀI
// '/api-sso' - gateway chỉ rewrite /api/api-sso/* -> /api-sso/* nên '/internal/*'
// không lộ ra ngoài qua gateway (giống api-task-management/src/app.ts).
app.use('/internal', internalAuth_1.requireInternalSecret, internalRouter_1.default);
// api-sso giờ CHỈ là API - giao diện login đã tách sang project riêng
// (sso-web), phục vụ qua gateway. api-sso không tự mở cổng ra internet nữa
// (đúng nguyên tắc production "chỉ frontend + gateway", xem docker-compose).
app.use('/api-sso', routes_1.default);
app.use((req, res) => {
    return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đường dẫn',
        request_id: res.locals.requestId,
    });
});
app.use(errorHandler_1.errorHandler);
exports.default = app;
