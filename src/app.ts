import 'reflect-metadata';

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { config } from './config/config';
import { getJwk } from './config/jwt';
import { errorHandler } from './errors/errorHandler';
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

app.use(
  rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
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
// /api/sso/uploads/* -> /api-sso/uploads/*. Không cần auth để xem ảnh.
app.use('/api-sso/uploads', express.static('uploads'));

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
