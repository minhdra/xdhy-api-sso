import 'reflect-metadata';

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import helmet from 'helmet';

import { config } from './config/config';
import { getJwk } from './config/jwt';
import { errorHandler } from './errors/errorHandler';
import { requireInternalSecret } from './middlewares/internalAuth';
import internalRouter from './routes/internalRouter';
import router from './routes';

const app = express();

// Request chain giống api-core: nginx/gateway -> service = tối đa 2 hop.
app.set('trust proxy', 2);

app.use(helmet());

app.use(
  cors({
    origin: config.cors.origin === '*' ? true : config.cors.origin.split(',').map((o) => o.trim()),
    credentials: true,
  }),
);

app.use(cookieParser());

// IIS/ARR ở deploy thật có thể ghi X-Forwarded-For dạng "ip:port" (đã gặp
// req.ip = "117.7.137.54:64477") khiến express-rate-limit v8 ném
// ERR_ERL_INVALID_IP_ADDRESS. Bóc phần ":port" trước khi tạo key, rồi đưa qua
// ipKeyGenerator để chuẩn hoá IPv6 (gộp /64) cho an toàn.
const stripPort = (ip: string): string => {
  if (!ip) return ip;
  if (ip.startsWith('[')) {
    const end = ip.indexOf(']');
    return end > 0 ? ip.slice(1, end) : ip;
  }
  const parts = ip.split(':');
  return parts.length === 2 ? parts[0] : ip;
};
const clientIpKey = (req: Request): string => ipKeyGenerator(stripPort(req.ip ?? ''));

app.use(
  rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: clientIpKey,
    // Bỏ đếm cho các route hạ tầng gọi server-to-server: api-gateway gọi
    // /session/validate MỖI request có auth của MỌI service -> tất cả chung
    // 1 key (IP gateway) -> ăn hết quota, user thật bị 429 oan. Tương tự
    // /internal/* (api-task gọi), JWKS, ảnh tĩnh. Limiter chỉ nên chặn abuse
    // từ trình duyệt (login, quên mật khẩu, /me...).
    skip: (req) =>
      req.path === '/api-sso/session/validate' ||
      req.path.startsWith('/internal/') ||
      req.path.startsWith('/api-sso/uploads/') ||
      req.path === '/.well-known/jwks.json',
  }),
);

app.use(express.json({ limit: config.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.bodyLimit }));

// Đường dẫn chuẩn cho JWKS (RFC 8615 well-known URI) - đặt ở gốc domain của
// api-sso, không phải dưới /api-sso, để khớp quy ước OIDC discovery mà các
// thư viện verify JWKS (jwks-rsa...) đều mong đợi.
app.get('/.well-known/jwks.json', (_req: Request, res: Response) => {
  res.json({ keys: [getJwk()] });
});

// Ảnh đại diện user upload (multer ghi vào uploads/avatars/). Gateway rewrite
// /api/api-sso/uploads/* -> /api-sso/uploads/*. Không cần auth để xem ảnh.
app.use('/api-sso/uploads', express.static('uploads'));

// Route nội bộ server-to-server (api-task-management gọi sang). Đặt NGOÀI
// '/api-sso' - gateway chỉ rewrite /api/api-sso/* -> /api-sso/* nên '/internal/*'
// không lộ ra ngoài qua gateway (giống api-task-management/src/app.ts).
app.use('/internal', requireInternalSecret, internalRouter);

// api-sso giờ CHỈ là API - giao diện login đã tách sang project riêng
// (sso-web), phục vụ qua gateway. api-sso không tự mở cổng ra internet nữa
// (đúng nguyên tắc production "chỉ frontend + gateway", xem docker-compose).
app.use('/api-sso', router);

app.use((req: Request, res: Response) => {
  return res.status(404).json({
    success: false,
    message: 'Không tìm thấy đường dẫn',
  });
});

app.use(errorHandler);

export default app;
