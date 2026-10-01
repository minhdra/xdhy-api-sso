"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearCookieOptions = exports.refreshCookieOptions = exports.accessCookieOptions = exports.REFRESH_COOKIE = exports.ACCESS_COOKIE = void 0;
const config_1 = require("./config");
exports.ACCESS_COOKIE = 'access_token';
exports.REFRESH_COOKIE = 'refresh_token';
const REMEMBER_ACCESS_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 1d
const REMEMBER_REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30d
const baseCookieOptions = {
    httpOnly: true,
    secure: config_1.config.cookie.secure ? config_1.config.cookie.secure === 'true' : config_1.config.env === 'production',
    sameSite: 'lax',
    path: '/',
    // Domain cha dùng chung (vd ".xdhy.vn") - cho phép trang login
    // chạy trên origin của chính api-sso set cookie rồi redirect về app khác
    // (build-web) vẫn đọc được cookie đó. Không set -> cookie host-only, đúng
    // luồng hiện tại (build-web tự proxy /api same-origin qua nginx).
    ...(config_1.config.cookie.domain ? { domain: config_1.config.cookie.domain } : {}),
};
// Khác biệt cố ý so với api-core/src/config/cookie.ts: nhận tham số `remember`.
// remember=false -> KHÔNG set maxAge -> cookie phiên (session cookie), trình
// duyệt tự xoá khi đóng ("chỉ session đó"). remember=true -> cookie sống lâu,
// khớp đúng hạn access/refresh token 1d/30d.
const accessCookieOptions = (remember) => remember
    ? { ...baseCookieOptions, maxAge: REMEMBER_ACCESS_TOKEN_MAX_AGE_MS }
    : { ...baseCookieOptions };
exports.accessCookieOptions = accessCookieOptions;
const refreshCookieOptions = (remember) => remember
    ? { ...baseCookieOptions, maxAge: REMEMBER_REFRESH_TOKEN_MAX_AGE_MS }
    : { ...baseCookieOptions };
exports.refreshCookieOptions = refreshCookieOptions;
// Dùng cho res.clearCookie() lúc logout - PHẢI khớp path/domain với lúc set
// (maxAge/secure/sameSite không cần, browser chỉ so path+domain để biết xoá
// đúng cookie nào). Thiếu domain ở đây là bug thật đã gặp: clearCookie không
// domain chỉ xoá được cookie host-only, cookie phạm vi COOKIE_DOMAIN vẫn
// nguyên - trông như "đã logout" (cookie rỗng mới chồng lên) nhưng cookie cũ
// còn hạn vẫn nằm đó, phiên cũ vẫn sống.
const clearCookieOptions = () => ({
    path: '/',
    ...(config_1.config.cookie.domain ? { domain: config_1.config.cookie.domain } : {}),
});
exports.clearCookieOptions = clearCookieOptions;
