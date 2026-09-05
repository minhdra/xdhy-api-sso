import { type CookieOptions } from 'express';

import { config } from './config';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

const REMEMBER_ACCESS_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 1d
const REMEMBER_REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30d

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: config.cookie.secure ? config.cookie.secure === 'true' : config.env === 'production',
  sameSite: 'lax',
  path: '/',
  // Domain cha dùng chung (vd ".sso-sandbox.orb.local") - cho phép trang login
  // chạy trên origin của chính api-sso set cookie rồi redirect về app khác
  // (build-web) vẫn đọc được cookie đó. Không set -> cookie host-only, đúng
  // luồng hiện tại (build-web tự proxy /api same-origin qua nginx).
  ...(config.cookie.domain ? { domain: config.cookie.domain } : {}),
};

// Khác biệt cố ý so với api-core/src/config/cookie.ts: nhận tham số `remember`.
// remember=false -> KHÔNG set maxAge -> cookie phiên (session cookie), trình
// duyệt tự xoá khi đóng ("chỉ session đó"). remember=true -> cookie sống lâu,
// khớp đúng hạn access/refresh token 1d/30d.
export const accessCookieOptions = (remember: boolean): CookieOptions =>
  remember
    ? { ...baseCookieOptions, maxAge: REMEMBER_ACCESS_TOKEN_MAX_AGE_MS }
    : { ...baseCookieOptions };

export const refreshCookieOptions = (remember: boolean): CookieOptions =>
  remember
    ? { ...baseCookieOptions, maxAge: REMEMBER_REFRESH_TOKEN_MAX_AGE_MS }
    : { ...baseCookieOptions };

// Dùng cho res.clearCookie() lúc logout - PHẢI khớp path/domain với lúc set
// (maxAge/secure/sameSite không cần, browser chỉ so path+domain để biết xoá
// đúng cookie nào). Thiếu domain ở đây là bug thật đã gặp: clearCookie không
// domain chỉ xoá được cookie host-only, cookie phạm vi COOKIE_DOMAIN vẫn
// nguyên - trông như "đã logout" (cookie rỗng mới chồng lên) nhưng cookie cũ
// còn hạn vẫn nằm đó, phiên cũ vẫn sống.
export const clearCookieOptions = (): CookieOptions => ({
  path: '/',
  ...(config.cookie.domain ? { domain: config.cookie.domain } : {}),
});
