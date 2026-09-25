# AGENTS.md

Quy tắc cho AI agent (bất kỳ công cụ nào) làm việc trong `api-sso`. Đọc trước khi sửa code — đặc biệt
phần "Trước khi đoán" và "Vận hành", 2 mục dễ gây sai lầm tốn thời gian nhất.

## Trước khi đoán — đọc, đừng suy đoán

- **Ý nghĩa `p_error_code` của 1 stored procedure không suy đoán từ tên proc hay từ proc khác.** Mỗi proc
  tự định nghĩa mã lỗi nghiệp vụ riêng — luôn tra `pg_get_functiondef()` proc thật trước khi map status
  code, cách làm ở [`docs/database.md`](./docs/database.md).
- **Không phải mọi bảng đều qua stored procedure.** `a_session`/`a_refresh_token`/
  `a_password_reset_token` (bảng riêng của `api-sso`, không đụng bảng dùng chung) thao tác bằng SQL thuần
  (`db.raw()`, xem `repositories/sessionRepository.ts`) — khác quy ước DB-wide "mọi nghiệp vụ nằm trong
  proc". Ngược lại, **mọi thao tác đụng `system_users`/`user_profiles`/`employee`** (bảng dùng chung với
  `api-core`) bắt buộc qua proc `a_*` sẵn có, không viết SQL thuần đụng vào các bảng đó — xem
  [`docs/database.md`](./docs/database.md).
- **`GET /me?app=<app_key>` fail-closed theo thiết kế, không phải bug.** `app_key` sai/không tồn tại
  trong `a_app`, hoặc user chưa có trong `a_app_access` → luôn `403` (trừ role `sa`) — đừng "sửa" thành
  fail-open để "cho qua nhanh" lúc test/debug. Đây là chốt chặn THẬT (không phải chỉ ẩn/hiện UI), xem
  [`docs/technical_decisions.md`](./docs/technical_decisions.md) mục "Enforce quyền app ở `/me`".
- **`requireAdmin` tính lại `a_IsUserAdmin` mỗi request, không tin field trong JWT.** Access token cấp
  lúc `/refresh` không mang `role_group` — đừng thêm field đó vào JWT rồi đọc tắt cho nhanh, phá đúng lý
  do thiết kế này (xem [`docs/architecture.md`](./docs/architecture.md) mục "Phân quyền quản trị").
- Chưa có `docs/features_issues.md` (changelog) trong repo này — nếu tạo mới, theo đúng format "mục mới
  ở đầu file, mỗi mục gắn ngày" như `api-task-management`/`task-web`/`sso-web` đã làm, không phải TODO
  list.

## Vận hành

- **DB remote thật** (`build_management`, cùng DB với `api-core`/`api-task-management` bảng dùng chung —
  xem `.env`), không phải container local. Mọi query chạm dữ liệu thật của người dùng thật — không chạy
  `DELETE`/`UPDATE`/DDL tuỳ tiện để "thử", kể cả qua stored procedure; đổi schema luôn qua file migration
  mới trong `db/migrations/`, không sửa tay trực tiếp trên DB rồi quên ghi lại.
- Local dev chạy `pnpm start` (`nodemon --exec ts-node`) — tự restart khi sửa file `.ts`, không cần build
  lại thủ công như service chạy qua Docker image dựng sẵn. `api-sso` **bắt buộc phải chạy** để bất kỳ
  frontend nào (`build-web`/`task-web`/`sso-web`) qua khỏi màn hình loading (`GET /me?app=` gọi lúc
  bootstrap) — xem [`docs/local_dev.md`](./docs/local_dev.md) trước khi kết luận "app kẹt loading" là bug
  ở frontend.
- `COOKIE_DOMAIN` để **rỗng** khi chạy local (không set `.xaydung.vn` hay tương tự) — set nhầm khiến
  cookie phiên không set được trên `localhost`. Luôn mở bằng `http://localhost:<port>`, không
  `127.0.0.1` — 2 hostname khác nhau, cookie phiên không theo qua được (chi tiết
  [`docs/local_dev.md`](./docs/local_dev.md) mục 3-4).
- `DB_HOST`/`DB_PORT`/`DB_NAME` của `api-sso` **phải trỏ đúng DB `build_management` giống `api-core`** —
  lệch DB thì đăng nhập qua `api-sso` tạo phiên cho user mà `api-core` không biết, lỗi rất khó nhận ra
  qua log thông thường.

## Conventions bắt buộc theo khi thêm route mới

- Route mới: dùng `defineRoute()` (`src/openapi/defineRoute.ts`) với zod schema, cùng khuôn
  `api-core`/`api-task-management` — không viết route thô thiếu validate.
- Danh tính người thao tác: `req.userId` (gắn bởi `middlewares/auth.ts` `requireAuth`, đã verify JWT +
  check session còn active trong `a_session`) — **không** có hàm `requireUserId()` riêng như
  `api-task-management`, dùng thẳng `req.userId as string`. Không nhận `created_by`/`lu_user_id` từ
  request body.
- Route nội bộ (server-to-server, không qua JWT người dùng): mount ở `app.ts` **ngoài** router
  `/api-sso` (gateway không rewrite `/internal/*` nên không lộ ra ngoài), bảo vệ bằng
  `middlewares/internalAuth.ts` (header `X-Internal-Secret`, `timingSafeEqual`) — theo đúng pattern
  `POST /internal/app-access/filter` đã có, không tự nghĩ cơ chế auth khác cho route nội bộ mới.
- Lỗi nghiệp vụ từ stored procedure: bọc thành `AppError` ở tầng service (xem `services/appService.ts`
  hàm `toAppError`) rồi để `next(error)` đi lên — không tự nuốt lỗi rồi trả `Error` thường (rơi vào
  nhánh 500 chung, mất status/message thật). Xem [`docs/api.md`](./docs/api.md) mục "Quy ước lỗi".
- Bảng dùng chung cần join/đọc chéo (`positions`/`department`/`branch`/`employee`/`roles`...): xác nhận
  tên cột thật trong DB trước khi viết SQL/proc mới — không có migration tool đọc schema từ code, tra
  trực tiếp DB (cách ở [`docs/database.md`](./docs/database.md) mục "Điều tra DB trực tiếp" — dùng `pg`
  qua `.env`, chỉ `SELECT`/`pg_get_functiondef()`).
- **File của user (avatar...) KHÔNG lưu ở api-sso** — api-core là nơi duy nhất lưu file + ghi
  `user_profiles.avatar`; api-sso chỉ validate rồi chuyển tiếp (`integrations/coreClient.ts`
  `uploadAvatar`). `uploads/` của api-sso chỉ còn icon app + avatar cũ (25/09/2026).

## Sau khi sửa xong

- `pnpm typecheck` — 0 lỗi trước khi coi là xong (không có script `lint`/eslint trong repo này).
- **Đổi/thêm business rule, quyền hạn, endpoint, migration, hoặc quyết định kỹ thuật → BẮT BUỘC cập nhật
  `docs/*.md` tương ứng trong CÙNG LƯỢT, không đợi user nhắc.** Grep tên rule/hàm/route liên quan trong
  `docs/` trước khi báo hoàn thành; không có doc nào nhắc tới thì thôi, có mà không cập nhật là sai.
- Không tự ý `git push`/tạo PR/merge trừ khi được yêu cầu rõ.
