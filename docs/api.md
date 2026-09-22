# API

Nguồn sự thật chính xác nhất: Swagger sinh trực tiếp từ code — `GET /api-sso/docs` (qua gateway:
`GET /api/docs/api-sso/`, mở công khai, không cần đăng nhập). File này là bản tóm tắt để tra nhanh; nếu
lệch với Swagger, tin Swagger.

Mọi response có header `X-Request-Id`. Client có thể gửi sẵn header này để
correlate log; nếu thiếu hoặc sai định dạng, `api-sso` tự sinh UUID. Các route
bootstrap `/me`, `/refresh`, `/apps` ghi structured log gồm request ID,
navigation ID/app version (nếu client gửi), status và latency; không log
token/cookie.

Các route `/me`, `/refresh`, `/apps` trả `Cache-Control: no-store, private,
must-revalidate` (kèm `Pragma: no-cache`, `Expires: 0`). Dữ liệu phiên/quyền
không được phép dùng ETag/`304` vì trạng thái có thể thay đổi tức thời.

Mọi endpoint dưới đây qua `api-gateway` ở tiền tố `/api/api-sso/*` → rewrite `/api-sso/*`
(`api-gateway/config*/gateway.config.yml`, pipeline `ssoApiPipeline`/`ssoDocsPipeline`). `sso-web` chỉ
gọi qua tiền tố này (`sso-web/src/api.ts`), không gọi thẳng `api-sso`. 6 đường tắt cũ
(`/api/login`, `/api/refresh`, `/api/logout`, `/api/me`, `/api/forgot-password`,
`/api/reset-password-confirm`) vẫn giữ cho `build-web`.

## Auth (`/login`, `/refresh`...)

| Method | Path | Body | Việc gì |
| --- | --- | --- | --- |
| POST | `/login` | `{ username, password, remember? }` | `username` nhận tài khoản/email/số điện thoại. Set cookie `access_token`+`refresh_token`. Trả `{user_id, full_name, user_name, role_group}` |
| POST | `/refresh` | — (đọc cookie `refresh_token`) | Cấp `access_token` mới nếu phiên chưa bị thu hồi/hết hạn |
| POST | `/logout` | — | Thu hồi phiên (`a_session`) + xoá cả 2 cookie |
| GET | `/me?app=<app_key>` | — | Thông tin user hiện tại + cây `functions`/`actions` (giống `api-core/users/me` cũ) + `is_admin`. Có `app` (app_key trong `a_app`) → **tự chặn 403** nếu user không có quyền app đó (admin luôn qua) — xem mục dưới |
| POST | `/forgot-password` | `{ email }` | Luôn trả cùng 1 message dù email tồn tại hay không. Gửi email chứa link `?token=` |
| POST | `/reset-password-confirm` | `{ token, newPassword }` | Token 1 lần, hạn 1 giờ |

`GET /.well-known/jwks.json` nằm **ở gốc domain api-sso**, không qua tiền tố `/api-sso` (chuẩn OIDC
discovery) — service khác verify JWT bằng key ở đây (package `jwks-rsa`).

## Account (`/account/*`) — cần đăng nhập (`requireAuth`)

| Method | Path | Body | Việc gì |
| --- | --- | --- | --- |
| GET | `/account/profile` | — | Hồ sơ đầy đủ: cá nhân + `position_name`/`department_name`/`branch_name` + `is_admin` |
| PUT | `/account/profile` | `{ full_name, email, phone_number, gender, date_of_birth }` | Chỉ sửa field tự phục vụ — **không đụng** `branch/department/position/type`. Sau khi ghi `build_management` → gọi `POST {CORE_INTERNAL_URL}/internal/users/profile-resync` (non-blocking) để api-core đồng bộ xuống task + chat + meeting |
| POST | `/account/avatar` | `multipart/form-data`, field `file` | Ảnh ≤5MB. Lưu tại `uploads/avatars/<username>--<user_id>/<uuid>.<ext>`, trả `{ avatar: "/api-sso/uploads/avatars/..." }`. Cũng gọi profile-resync như trên |
| POST | `/account/change-password` | `{ oldPassword, newPassword }` | Verify mật khẩu cũ bằng bcrypt trước khi đổi |
| GET | `/account/sessions` | — | Danh sách phiên đang hoạt động, cờ `current` cho phiên gọi request này |
| POST | `/account/sessions/revoke` | `{ session_id }` | Không thu hồi được **chính phiên hiện tại** (dùng `/logout`) |

## Apps (`/apps`) — cần đăng nhập

| Method | Path | Việc gì |
| --- | --- | --- |
| GET | `/apps` | Danh sách app cho trang chủ `sso-web`. Admin (`is_admin`) thấy **mọi** app active; người khác chỉ thấy app đã được cấp qua `a_app_access` |

**`GET /apps` chỉ điều khiển UI (tile nào hiện ở trang chủ) — không phải nơi chặn thật.** Chặn thật nằm
ở `GET /me?app=<app_key>` (bảng trên): app nào muốn tự bảo vệ (không cho vào chỉ vì có cookie hợp lệ)
phải tự gọi `/me` kèm đúng `app_key` của mình lúc bootstrap (giống cách `build-web` gọi `/me` để biết
"đã đăng nhập chưa" — chỉ cần thêm `?app=`), và xử lý 403 riêng (khác 401 "chưa đăng nhập"). `app_key`
sai/không tồn tại trong `a_app` → **fail-closed** (coi như không có quyền, trừ admin) — tránh lỗi gõ sai
tên vô tình tắt luôn kiểm tra.

## Admin (`/admin/*`) — cần `requireAuth` + `requireAdmin` (role `sa`)

| Method | Path | Body | Việc gì |
| --- | --- | --- | --- |
| GET | `/admin/apps` | — | Toàn bộ app active kèm `direct_access_count`, `eligible_user_count`, `effective_access_count` |
| POST | `/admin/apps` | `{ app_id?, app_key, app_name, description?, url?, color?, sort_order? }` | `app_id` rỗng/thiếu = tạo mới; có giá trị = cập nhật. `app_key` trùng (còn active) → 400 |
| POST | `/admin/apps/{app_id}/icon` | `multipart/form-data`, field `file` | Admin upload PNG 46 × 46, tối đa 1MB; lưu vào volume `uploads/app-icons` và ghi URL vào `a_app.icon`; GET `/apps` và `/admin/apps` đọc `icon` từ DB (URL hoặc `null`). Ảnh cũ được thay theo `app_id` |
| POST | `/admin/apps/delete` | `{ app_id }` | Xoá mềm + xoá luôn toàn bộ quyền đã cấp trên app đó |
| GET | `/admin/apps/{app_id}/access` | — | Danh sách người đang được cấp quyền |
| POST | `/admin/apps/{app_id}/access` | `{ user_ids: string[] }` | **Thay toàn bộ** danh sách (không phải cộng/trừ từng người) |
| GET | `/admin/apps/{app_id}/access-candidates` | `q?`, `position_id?`, `page?`, `page_size?` | User active chưa có quyền hiệu lực; loại admin và grant đã tồn tại; trả `{ rows, total, page, page_size }` |
| POST | `/admin/apps/{app_id}/access/add` | `{ user_ids: string[] }` | Cộng quyền theo delta, idempotent; trả `affected` thực tế |
| POST | `/admin/apps/{app_id}/access/remove` | `{ user_ids: string[] }` | Gỡ quyền theo delta, idempotent; trả `affected` thực tế |
| GET | `/admin/users` | — | Danh sách user active (cho ô chọn multi-select ở trang quản trị) |

## Nội bộ (`/internal/*`) — server-to-server, KHÔNG qua gateway, KHÔNG JWT

Mount ở app level (`app.ts`), **ngoài** router `/api-sso` — gateway chỉ rewrite `/api/api-sso/*` →
`/api-sso/*` nên `/internal/*` không lộ ra ngoài. Xác thực bằng header `X-Internal-Secret`
(`middlewares/internalAuth.ts`, `timingSafeEqual`), giá trị `INTERNAL_SECRET`. Không lên Swagger.

| Method | Path | Body | Việc gì |
| --- | --- | --- | --- |
| POST | `/internal/app-access/filter` | `{ app_key, user_ids: string[] }` | → `{ allowed_user_ids: string[] }` — lọc tập user, giữ lại người có quyền app (admin `sa` bypass tính là có; `app_key` sai/không active → loại hết non-admin). Dùng hàm `a_FilterUsersWithAppAccess` (bọc `a_UserHasAppAccess`). |

Client hiện tại: `api-task-management` (`src/integrations/ssoInternalClient.ts`) — lọc danh sách chọn
người ở màn Phân quyền công trình theo quyền app `task`. Xem
[`../../api-task-management/docs/phan_quyen_giam_sat_app_gate.md`](../../api-task-management/docs/phan_quyen_giam_sat_app_gate.md).

## Quy ước lỗi

`errors/errorHandler.ts`: `AppError(statusCode, message)` → `{ success: false, message }` đúng status;
lỗi khác → 500 (`config.env === 'production'` thì ẩn message thật, dev thì trả nguyên message để debug).

Lỗi nghiệp vụ từ stored procedure (`p_error_code !== 0`) làm `Database.query()` throw `Error(p_error_message)`
— tầng `service` bắt lại và bọc thành `AppError(400, ...)` (xem `services/appService.ts` hàm `toAppError`,
cùng pattern `userRepository.resetPassword` bắt lỗi `"không đúng"` của `ResetPassword`). Không có quy ước
mã lỗi cố định xuyên suốt (giống ghi chú ở `api-task-management/docs/database.md` mục "Quy ước stored
procedure" — `-1` không phải "not found" toàn cục, tuỳ proc tự định nghĩa).
