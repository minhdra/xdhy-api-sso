import env from '@ltv/env';
import * as dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const value = env.string(key);
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  env: env('NODE_ENV', 'development'),
  port: env.int('PORT', 6005),
  cors: {
    origin: env('CORS_ORIGIN', 'http://localhost:3010'),
  },
  db: {
    host: requireEnv('DB_HOST'),
    port: env.int('DB_PORT', 5432),
    username: requireEnv('DB_USERNAME'),
    password: requireEnv('DB_PASSWORD'),
    database: requireEnv('DB_NAME'),
    poolMax: env.int('DB_POOL_MAX', 5),
    poolMin: env.int('DB_POOL_MIN', 1),
    queryTimeout: env.int('DB_QUERY_TIMEOUT', 20000),
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
    kid: env('JWT_KID', 'sandbox-1'),
    // Mặc định khi remember=false (giữ đúng hạn hiện có của api-core).
    // remember=true dùng thẳng hằng số 1d/30d ở controllers/authController.ts,
    // không cần thêm biến môi trường riêng cho bản sandbox này.
    accessExpiresIn: env('JWT_ACCESS_EXPIRES_IN', '15m'),
    refreshExpiresIn: env('JWT_REFRESH_EXPIRES_IN', '7d'),
  },
  cookie: {
    // Domain cha dùng chung - cho phép cookie set bởi api-sso (ở origin của
    // chính nó, vd trang login) đọc được từ origin của app khác (vd
    // build-web) khi cả 2 cùng nằm dưới domain gốc này. Không set (undefined)
    // = cookie host-only như hiện tại (chỉ đúng 1 origin), vẫn đúng cho luồng
    // build-web proxy /api same-origin qua nginx.
    domain: env('COOKIE_DOMAIN', ''),
    // OrbStack (`*.orb.local`) tự cấp HTTPS dù NODE_ENV vẫn là development -
    // cần ép Secure=true trong trường hợp đó (browser bỏ qua Set-Cookie có
    // Secure nếu response tới qua HTTP thường, và ngược lại chấp nhận Secure
    // trên HTTPS bất kể NODE_ENV). Không set -> giữ mặc định cũ
    // (`env === 'production'`).
    secure: env('COOKIE_SECURE', ''),
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
    windowMs: env.int('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    max: env.int('RATE_LIMIT_MAX', 300),
  },
  bodyLimit: env('BODY_LIMIT', '1mb'),
};
