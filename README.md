# API SSO

Dịch vụ xác thực tập trung (Single Sign-On) cho toàn hệ thống XDHY — nơi **duy nhất** phát hành/xác thực
token đăng nhập, quản lý phiên, và quyết định tài khoản nào được dùng ứng dụng nào. Các service khác
(`api-core`, `api-task-management`) không còn tự làm đăng nhập — chỉ verify chữ ký token do service này
ký, xây bằng **Node.js + TypeScript + Express**.

## Tech stack

- **Runtime**: Node.js (>= 18), TypeScript 5
- **Framework**: Express
- **Dependency Injection**: tsyringe + reflect-metadata
- **Database**: PostgreSQL (`pg`) — không có DB riêng, đọc/ghi thẳng `build_management` (dùng chung với
  `api-core`)
- **Auth**: JWT ký RS256 (`jsonwebtoken`), public key phơi qua JWKS (`jwks-rsa` ở phía service khác đọc
  lại), mật khẩu hash bằng `bcrypt`
- **Validate + docs API**: `zod` + `@asteasolutions/zod-to-openapi` + `swagger-ui-express`
- **Email**: nodemailer (quên mật khẩu)
- **Package manager**: pnpm

## Cấu trúc thư mục

```
src/
  app.ts               # Khởi tạo Express app, middleware, mount routes
  index.ts              # Entry point, start server
  config/                # Cấu hình app (env, db, jwt, cookie, email)
  openapi/               # zod schema -> OpenAPI, Swagger UI (GET /docs)
  routes/                # auth (login/refresh/logout/me...), account, admin
  controllers/            # Xử lý request/response
  services/               # Nghiệp vụ
  repositories/           # Gọi stored procedure qua Database, SQL thuần cho bảng a_*
  middlewares/            # requireAuth, validate...
  schemas/                # zod schema (validate + openapi)
  models/                 # Kiểu dữ liệu domain
  errors/                 # AppError + error handler tập trung
  utilities/              # hash mật khẩu, cây quyền...
keys/                   # Cặp khoá RS256 ký JWT (KHÔNG commit, .gitignore sẵn)
db/
  migrations/             # Migration SQL cho bảng a_* + proc a_* (xem db/README.md)
docs/
  architecture.md          # Kiến trúc, vị trí trong hệ thống
  api.md                   # API contract / endpoint
  database.md              # Bảng a_* sở hữu + bảng dùng chung đọc lại
  technical_decisions.md   # Quyết định kỹ thuật + lý do (RS256, cookie domain cha, phân quyền app...)
  local_dev.md              # Chạy CẢ CỤM hệ thống ở local (không chỉ riêng service này)
```

## Getting started

### Yêu cầu

- Node.js >= 18
- pnpm >= 9 (`corepack enable` để tự động dùng đúng version)
- PostgreSQL (kết nối tới `build_management` — xem [`docs/database.md`](./docs/database.md), service
  này không có DB riêng)

### Cài đặt

```bash
pnpm install
cp .env.example .env   # rồi điền giá trị thật
```

**Sinh cặp khoá RS256** để ký token (bắt buộc — service không start được nếu thiếu, xem
`JWT_PRIVATE_KEY_PATH` trong `.env.example`):

```bash
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

Đừng commit thư mục `keys/` — đã có sẵn trong `.gitignore`. Mỗi môi trường (dev, production) nên có
cặp khoá riêng.

**Áp migration** cho các bảng/proc `a_*` (xem quy tắc đầy đủ ở [`db/README.md`](./db/README.md)):

```bash
for file in db/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f "$file"
done
```

### Chạy dev

```bash
pnpm start
```

Mặc định lắng nghe ở cổng `6005`. Chỉ chạy riêng `api-sso` sẽ không đủ để đăng nhập/dùng được — cần cả
`api-core` (đọc `system_users`/`user_profiles`) và thường cần `api-gateway` phía trước. Xem
[`docs/local_dev.md`](./docs/local_dev.md) để chạy đúng cả cụm.

### Build & typecheck

```bash
pnpm build       # biên dịch ra dist/
pnpm typecheck    # kiểm tra kiểu TypeScript, không emit
```

### Kiểm tra API bằng Swagger

Sau khi chạy dev, mở `http://localhost:6005/docs` (hoặc qua gateway:
`http://localhost:6688/api/docs/api-sso/`) — tài liệu sinh trực tiếp từ code (zod schema), luôn khớp
đúng thực tế, tin tài liệu này hơn `docs/api.md` nếu có lệch.

## Docker

Không có `docker-compose.yml` riêng cho service này — chạy cùng cụm ở gốc repo:

```bash
docker compose -f ../docker-compose.real.yml up -d --build api-sso
```

## Tài liệu dự án

- [`docs/architecture.md`](./docs/architecture.md) — Kiến trúc, vị trí trong toàn hệ thống
- [`docs/api.md`](./docs/api.md) — API contract / endpoint (login, account, apps, admin...)
- [`docs/database.md`](./docs/database.md) — Bảng `a_*` sở hữu + bảng dùng chung đọc lại qua proc có sẵn
- [`docs/technical_decisions.md`](./docs/technical_decisions.md) — Quyết định kỹ thuật + lý do (RS256 +
  JWKS, cookie domain cha, thu hồi phiên, phân quyền ứng dụng theo người dùng...)
- [`docs/local_dev.md`](./docs/local_dev.md) — Chạy cả cụm hệ thống (7 service) ở môi trường local
- [`db/README.md`](./db/README.md) — Quy tắc migration cho bảng/proc `a_*`
