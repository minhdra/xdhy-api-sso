# Architecture

## Vị trí trong hệ thống

```
sso-web (đăng nhập, quản lý tài khoản)   build-web (app chính)
              │                                    │
              └──────────────┬─────────────────────┘
                              ▼
                       api-gateway (:6688)
                    rewrite /api/api-sso/* → /api-sso/*
                    verify JWT qua JWKS (jwks-rsa)
                              │
                              ▼
                          api-sso (:6005)
                    ký/verify token RS256, phát JWKS
                              │
                              ▼
              PostgreSQL build_management (remote, dùng chung
              với api-core/api-task-management — không có DB riêng)
```

`api-sso` là **API thuần** — không phục vụ HTML nào (kể cả trang login), khác hẳn `api-core` bản cũ.
Giao diện đăng nhập/quản lý tài khoản nằm ở [`sso-web`](../../sso-web) (frontend độc lập, port riêng),
gọi API same-origin qua nginx proxy của chính nó sang `api-gateway` (giống `build-web`/`task-web` —
xem `sso-web/docs/architecture.md`). Không tự publish port ra internet trong production (chỉ
`expose`, đúng nguyên tắc "chỉ frontend + gateway mở cổng" — xem `docker-compose.real.yml`).

`api-sso` tách ra từ `api-core`: `login/refresh/logout/me/forgot-password` từng nằm trong
`api-core/src/controllers/userController.ts`, giờ route đó trả `410 Gone` (xem
`api-core/src/controllers/userController.ts`) — `api-core` **để nguyên, không sửa gì khác**, chỉ không
còn ai gọi tới các route auth cũ của nó. `api-core` vẫn là nơi duy nhất quản trị `system_users`/
`user_profiles`/`roles`/`positions`... — `api-sso` chỉ **đọc/ghi trực tiếp cùng schema đó**, không có
migration hay bảng "user" riêng.

## Cấu trúc `src/`

```
routes/          — khai path + method, dùng defineRoute() (validate + OpenAPI 1 lần)
  ↓
controllers/     — mỏng: đọc req, gọi service, next(error) khi catch
  ↓
services/        — nghiệp vụ tầng app (verify mật khẩu bcrypt, ký JWT, gộp dữ liệu...)
  ↓
repositories/    — build câu `CALL "proc"(...)`/SQL thuần, gọi qua Database
  ↓
config/database.ts — Pool Postgres (retry + circuit breaker), map lỗi stored procedure
  ↓
PostgreSQL stored procedures — nghiệp vụ + validation cho phần đụng bảng dùng chung
```

Các thư mục khác: `middlewares/` (`auth.ts` = `requireAuth`, `requireAdmin.ts`, `validate.ts` = zod),
`schemas/` (zod, cũng dùng để sinh OpenAPI), `openapi/` (`defineRoute`/`registry`/`document` — copy
khuôn từ `api-core`), `errors/` (`AppError` + `errorHandler`), `models/`, `utilities/` (`password.ts`:
bcrypt + tương thích hash MD5 cũ, `tree.ts`: dựng cây `functions`).

Dependency injection bằng `tsyringe` (`@injectable()` + `container.resolve()` ngay trong route file) —
đúng pattern `api-core`/`api-task-management`, không có `container.ts` trung tâm.

## Auth flow

JWT ký **RS256** (không còn `JWT_SECRET` chia sẻ) — `api-sso` là nơi **duy nhất** giữ private key
(`JWT_PRIVATE_KEY_PATH`, **không** bake vào image, mount volume lúc chạy). Public key phát ở
`GET /.well-known/jwks.json` (mount ở gốc domain, **không** dưới `/api-sso` — đúng chuẩn RFC 8615/OIDC
discovery mà `jwks-rsa` mong đợi). `api-gateway`, `api-task-management` verify bằng JWKS này
(`config/jwt.ts` mỗi service, package `jwks-rsa`), không giữ secret nào.

Cookie `access_token`/`refresh_token` set `Domain=.{domain-cha}` (`COOKIE_DOMAIN`) để dùng chung được
giữa `build-web`/`sso-web`/các app tương lai (chat/meeting) trên cùng domain cha.

**"Ghi nhớ đăng nhập" (`remember`):**

| | `remember=false` (mặc định) | `remember=true` |
|---|---|---|
| Access token | 15 phút | 1 ngày |
| Refresh token | 7 ngày | 30 ngày |
| Cookie | session cookie (mất khi đóng trình duyệt) | persistent (`Max-Age` khớp hạn token) |

**Đăng nhập bằng tài khoản/email/số điện thoại:** `resolveUsername()` (`userRepository.ts`) tra bằng
SQL thuần trên `system_users`/`user_profiles` trước, quy mọi kiểu định danh về đúng `user_name`, rồi mới
đi tiếp luồng cũ (`authenticate` → `CALL "GetUserByAccount"`) — **không sửa** stored procedure gốc
(dùng chung với `api-core`, rủi ro nếu sửa).

**Phiên đăng nhập thu hồi được (`a_session`/`a_refresh_token`):** khác `api-core` bản cũ (refresh token
chỉ ký `{user_id}`, không revoke được), `api-sso` tạo 1 dòng `a_session` + `a_refresh_token` mỗi lần
login. `requireAuth` (`middlewares/auth.ts`) kiểm tra **DB trực tiếp** mỗi request qua
`SessionRepository.isSessionActive()` — không chỉ tin chữ ký JWT còn hạn. Đây là điểm khác với các
service khác (`api-task-management`/`api-gateway` verify JWT xong là xong, không tra DB) — xem
[`technical_decisions.md`](./technical_decisions.md) mục "Thu hồi phiên: đánh đổi độ trễ".

## Middleware chain (`app.ts`)

`trust proxy: 2` (nginx/gateway → service = tối đa 2 hop) → `helmet()` → `cors()` (origin từ
`CORS_ORIGIN`, dùng khi gọi trực tiếp không qua gateway lúc dev) → `cookieParser()` →
`express-rate-limit` → `express.json()`/`urlencoded()` → `GET /.well-known/jwks.json` (gốc domain) →
`GET /api-sso/uploads/*` static (avatar) → `/api-sso` router → 404 handler → `errorHandler`.

## Upload avatar

`multer` diskStorage ghi `uploads/avatars/<username>--<user_id>/<uuid>.<ext>` (chỉ ảnh, ≤5MB —
`config/avatarUpload.ts`). Username giúp nhận diện nhanh, còn `user_id` được encode thành một path segment
ổn định để tránh trùng/đổi tên; UUID là tên vật lý bất biến và tên gốc không được dùng. Avatar cũ tại
`uploads/avatars/<filename>` vẫn được serve để tương thích. Serve
lại qua `express.static('uploads')` mount ở `/api-sso/uploads`. Lưu
**local disk trong container** — mất khi container bị recreate (không volume riêng, không object
storage) — chấp nhận được cho quy mô hiện tại, xem giới hạn tương tự ở
`api-task-management/docs/technical_decisions.md` (upload local disk).

## Validate + OpenAPI

Copy nguyên khuôn từ `api-core`: mỗi route khai 1 lần qua `defineRoute({ method, path, schema,
responses })` (`openapi/defineRoute.ts`) — vừa đăng ký OpenAPI path (`registry.ts`), vừa trả
`validate(schema)` middleware (zod, `middlewares/validate.ts`). Doc luôn khớp runtime vì cùng 1 nguồn.
Swagger UI ở `GET /api-sso/docs` (mở công khai, không qua `requireAuth`).

## Phân quyền quản trị (`requireAdmin`)

"Admin" = có role **active** với `roles.role_code = 'sa'` ("Quản trị hệ thống") — tái dùng khái niệm đã
có sẵn trong DB (không bịa role mới), đúng role mà `api-gateway/middleware/index.js` bản cũ từng định
nghĩa (code đã tắt: `role_group.indexOf('sa,')`). Tính lại **mỗi request** qua hàm DB `a_IsUserAdmin`
(`middlewares/requireAdmin.ts`) — không tin field `role_group` trong JWT, vì access token cấp lúc
`/refresh` không mang lại field đó (xem `authService.refresh`). Áp dụng cho toàn bộ `adminAppRouter`
(`/admin/apps`, `/admin/users`).

## Scheduled cleanup

Service tự khởi động `dataCleanupJob` cùng HTTP server và dừng timer trong graceful shutdown. Job không
có endpoint công khai; nó dọn ba bảng auth theo retention, cùng avatar vật lý không còn DB tham chiếu
sau grace period, xóa theo batch/giới hạn scan và dùng advisory lock để an toàn khi chạy nhiều instance.
Lỗi cleanup chỉ được log, không làm dừng server.

## Docker

Multi-stage: build stage cần `python3 make g++` (biên dịch native binding cho `bcrypt` — alpine không
có prebuilt binary sẵn), production stage cài lại `pnpm install --prod` rồi chạy thẳng `node
dist/index.js` (không `nodemon`/`ts-node`). `EXPOSE 6005`, chỉ `expose` trong compose (không publish ra
host) trừ khi soi trực tiếp qua port publish.
