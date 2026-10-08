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
| GET | `/me?app=<app_key>` | — | Thông tin user hiện tại (danh tính, chức vụ) + `is_admin`. **Không còn `functions`/`actions`** (26/09/2026) — tính năng thuộc từng app: tài chính `GET /api-core/me/permissions`, công việc `GET /api-task/me/permissions`. Có `app` (app_key trong `a_app`) → **tự chặn 403** nếu user không có quyền app đó (admin luôn qua) — xem mục dưới |
| POST | `/forgot-password` | `{ email }` | Luôn trả cùng 1 message dù email tồn tại hay không. Gửi email chứa link `?token=` |
| POST | `/reset-password-confirm` | `{ token, newPassword }` | Token 1 lần, hạn 1 giờ |

`GET /.well-known/jwks.json` nằm **ở gốc domain api-sso**, không qua tiền tố `/api-sso` (chuẩn OIDC
discovery) — service khác verify JWT bằng key ở đây (package `jwks-rsa`).

## Account (`/account/*`) — cần đăng nhập (`requireAuth`)

| Method | Path | Body | Việc gì |
| --- | --- | --- | --- |
| GET | `/account/profile` | — | Hồ sơ đầy đủ: cá nhân + `position_name`/`department_name`/`branch_name` + `is_admin` |
| PUT | `/account/profile` | `{ full_name, email, phone_number, gender, date_of_birth }` | Chỉ sửa field tự phục vụ — **không đụng** `branch/department/position/type`. Ghi `sso_management` rồi xếp đồng bộ user sang các app (`a_sync_outbox`) |
| POST | `/account/avatar` | `multipart/form-data`, field `file` | Ảnh ≤5MB (jpg/png/gif/webp). Từ 26/09/2026 **api-sso lưu file** `uploads/avatars/<username>--<user_id>/<uuid>.<ext>`, ghi `/api-sso/uploads/avatars/...` vào `sso_management`, xoá file cũ, xếp đồng bộ user sang các app. Trả `{ avatar: "/api/api-sso/uploads/avatars/..." }` |
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
| GET | `/admin/apps` | — | Toàn bộ app active kèm `direct_access_count`, `eligible_user_count`, `effective_access_count`. Từ 0014: `direct_access_count` và `eligible_user_count` **loại admin** (tỉ lệ luôn ≤ 100%), `effective_access_count` vẫn tính admin |
| POST | `/admin/apps` | `{ app_id?, app_key, app_name, description?, url?, color?, sort_order? }` | `app_id` rỗng/thiếu = tạo mới; có giá trị = cập nhật. `app_key` trùng (còn active) → 400 |
| POST | `/admin/apps/{app_id}/icon` | `multipart/form-data`, field `file` | Admin upload PNG 138 × 138, tối đa 1MB; lưu file có tên mới vào volume `uploads/app-icons` và ghi URL vào `a_app.icon`; GET `/apps` và `/admin/apps` đọc `icon` từ DB (URL hoặc `null`). File cũ được dọn sau khi DB cập nhật thành công |
| POST | `/admin/apps/delete` | `{ app_id }` | Xoá mềm + xoá luôn toàn bộ quyền đã cấp trên app đó |
| GET | `/admin/apps/{app_id}/access` | — | Danh sách người đang được cấp quyền |
| POST | `/admin/apps/{app_id}/access` | `{ user_ids: string[] }` | **Thay toàn bộ** danh sách (không phải cộng/trừ từng người) |
| GET | `/admin/apps/{app_id}/access-candidates` | `q?`, `position_id?`, `page?`, `page_size?` | User active chưa có quyền hiệu lực; loại admin và grant đã tồn tại; trả `{ rows, total, page, page_size }` |
| POST | `/admin/apps/{app_id}/access/add` | `{ user_ids: string[] }` | Cộng quyền theo delta, idempotent; trả `affected` thực tế |
| POST | `/admin/apps/{app_id}/access/remove` | `{ user_ids: string[] }` | Gỡ quyền theo delta, idempotent; trả `affected` thực tế |
| GET | `/admin/users` | — | Danh sách user active **trừ admin** (role `sa` bypass mọi app nên không cần/không được cấp quyền — khớp `access-candidates`) cho modal quyền ở trang quản trị |

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

## Quản trị người dùng / tổ chức / nhóm quyền (`/admin/org/*`) — chỉ admin (26/09/2026)

Chuyển từ `api-core` (màn "Quản trị hệ thống" của build-web) sang SSO. `requireAuth` + `requireAdmin`.
Người thao tác lấy từ phiên — **không** nhận `created_by_user_id`/`lu_user_id` từ body. Mọi thay đổi
thành công đều xếp đồng bộ sang app (xem mục "Đồng bộ"). `pageIndex` bắt đầu từ **1** (proc `Search*`).

| Method | Path | Body | Việc gì |
| --- | --- | --- | --- |
| POST | `/admin/org/users/search` | `{ pageIndex, pageSize, search_content?, branch_id?, department_id? }` | `{ totalItems, page, pageSize, pageCount, data }` (proc `SearchUser`, avatar đã thành URL) |
| GET | `/admin/org/users/:user_id` | — | Chi tiết cho form sửa + `role_ids` |
| POST | `/admin/org/users` | `{ user_name (a-z 0-9 . _ -, 3–50), password? (trống = 123456), full_name (chỉ chữ, 2–60), phone_number (10 số, đầu 0), full_name, email, phone_number?, gender?, date_of_birth?, branch_id, department_id, position_id, type?, description?, role_ids? }` | Tạo user (bcrypt, `user_id = employee_id = uuid`). 400 nếu trùng tên đăng nhập với user **đang hoạt động**. Trùng với user **đã xoá mềm** → 409 `data: { code: 'DELETED_USER_EXISTS', deleted_user: { user_id, user_name, full_name, email, phone_number, deleted_at } }`; gửi lại kèm `deleted_user_action: 'restore'` (khôi phục user cũ, giữ `user_id` — proc `RestoreUser`, cập nhật theo form, ghi lại nhóm quyền, KHÔNG cấp lại quyền app; response `restored: true`) hoặc `'new'` (tạo user mới, `user_id` mới). Chat/meeting upsert theo `id` và có unique email/SĐT nên cùng một người phải khôi phục, không tạo mới (04/10/2026) |
| PUT | `/admin/org/users` | như trên + `user_id`, bỏ `user_name`/`password` | Sửa user. SĐT/email trùng user đang hoạt động khác (cả tạo mới/khôi phục/sửa, và `PUT /account/profile`) → **409** `data: { code: 'PHONE_TAKEN' | 'EMAIL_TAKEN', field: 'phone_number' | 'email' }`, message nêu tài khoản đang giữ (08/10/2026, migration 0012/0013). Trùng với user **đã xoá** thì cho phép, và xếp lệnh "xoá" user đã xoá đó sang chat/meeting TRƯỚC để nhả SĐT/email bên đó (`SyncService.releaseDeletedUsers`); `role_ids` có mặt thì thay toàn bộ nhóm quyền. Không sửa avatar (user tự đổi) |
| POST | `/admin/org/users/delete` | `{ user_ids }` | **Xoá mềm** (proc `DeleteUser` bản 0005): `active_flag=0` 4 bảng, thu hồi mọi phiên, gỡ quyền app. Không tự xoá chính mình |
| POST | `/admin/org/users/lock` | `{ user_id, online_flag }` | `online_flag=1` = khoá (`GetUserByAccount` chỉ cho đăng nhập khi `0`) — khoá thì thu hồi luôn mọi phiên. Không tự khoá mình |
| POST | `/admin/org/users/reset-password` | `{ user_id }` | Mật khẩu ngẫu nhiên (crypto), gửi email nếu có; trả `{ new_password, emailed }` cho admin |
| POST | `/admin/org/users/:user_id/avatar` | `multipart/form-data`, field `file` | Admin đổi avatar hộ user - cùng luồng `/account/avatar` (thư mục của user được đổi) |
| PUT | `/admin/org/users/:user_id/roles` | `{ role_ids }` | Gán lại toàn bộ nhóm quyền (rỗng = gỡ hết). Admin không tự gỡ nhóm `sa` của mình |
| POST | `/admin/org/{branches,departments,positions}/search` | `{ pageIndex, pageSize, search_content? }` | Danh sách phân trang |
| GET | `/admin/org/{branches,departments,positions,roles}/dropdown` | — | `[{ label, value }]` |
| POST | `/admin/org/{branches,departments,positions}` | `{ <x>_id?, <x>_name, phone?, fax?, address? }` / chức vụ `{ position_id?, position_name, description? }` | Id rỗng = thêm (identity) |
| POST | `/admin/org/{branches,departments,positions}/delete` | `{ ids: number[] }` | Xoá mềm |
| POST | `/admin/org/roles/search` | `{ pageIndex, pageSize, search_content? }` | Nhóm quyền |
| POST | `/admin/org/roles` | `{ role_id?, role_code, role_name, description? }` | 400 nếu trùng mã; không đổi được mã của nhóm `sa` |
| POST | `/admin/org/roles/delete` | `{ role_ids }` | Xoá mềm; không xoá được nhóm `sa` |
| GET | `/admin/org/sync/status` | — | `{ enabled_targets, summary[{target, pending, retrying, failed, head_error, head_attempts, head_next_retry_at, oldest_pending, last_done_at}] }` — `head_*` = dòng đầu hàng đang chờ thử lại (đang chặn đích đó) |
| POST | `/admin/org/sync/history` | `{ target?, status?, entity?, search?, pageIndex, pageSize ≤200 }` | Nhật ký: mọi dòng outbox mới nhất trước, kèm `entity_label` (tên user/chi nhánh…), `created_by_name`, `note`. `search` khớp mã hoặc tên. `{ totalItems, page, pageSize, data }` |
| POST | `/admin/org/sync/retry` | `{ target? }` hoặc `{ ids }` | Thử lại ngay: theo đích = mọi dòng `failed` + dòng `pending` đang backoff; theo `ids` = cả dòng `skipped`. Reset `attempts`, gửi ngay |
| POST | `/admin/org/sync/skip` | `{ target? }` hoặc `{ ids }` | Bỏ qua dòng `pending`/`failed` (→ `skipped`, `note` ghi người bỏ qua) để hàng đợi đi tiếp |
| POST | `/admin/org/sync/resync` | `{ target }` | Xếp lại TOÀN BỘ dữ liệu hiện có sang 1 đích (đối soát / đích mới bật) |

## Đồng bộ sang app (gọi ra, không phải endpoint của api-sso)

Worker (`jobs/syncOutboxJob.ts`) đọc `a_sync_outbox` theo thứ tự id **từng đích**, đọc **snapshot hiện
tại** của entity rồi `POST {đích}/internal/sync/<path>` (header `X-Internal-Secret`). Entity không còn /
đã xoá mềm → gửi lệnh xoá. Xử lý lỗi (08/10/2026 — trước đó 500 bị coi là lỗi tạm, thử lại backoff tới 30
phút × 12 lần và **chặn cả hàng đợi** của đích, nút "Thử lại" lại chỉ áp cho dòng `failed`):

- Đích từ chối dữ liệu (4xx trừ 408/429) → `failed` ngay, gửi tiếp dòng sau.
- Đích lỗi khi xử lý (5xx trừ 502/503/504, vd chat/meeting trả 500 khi trùng SĐT unique) → thử
  `SYNC_OUTBOX_SERVER_ERROR_ATTEMPTS` (3) lần rồi `failed`, gửi tiếp dòng sau.
- Mất kết nối/timeout/502/503/504/408/429 (đích tạm sập) → giữ thứ tự, backoff 5s… tối đa
  `SYNC_OUTBOX_MAX_BACKOFF_SECONDS` (300), quá `SYNC_OUTBOX_MAX_ATTEMPTS` (12) → `failed`.
- `notify()` cho entity đang có dòng chờ thử lại → dòng đó gửi lại ngay (admin sửa dữ liệu xong là đi luôn).
- Gửi thành công → các dòng `failed` cũ hơn cùng đích + entity tự chuyển `skipped` (ghi chú "đã đồng bộ ở
  lần gửi sau").

| Đích | Base URL / secret | Nhận |
| --- | --- | --- |
| `finance` (api-core → `build_management`) | `CORE_INTERNAL_URL` / `CORE_INTERNAL_SECRET` | user, user_roles, branch, department, position, role |
| `task` (api-task → `task_management`) | `SYNC_TASK_URL` / `SYNC_TASK_SECRET` (= `TASK_SYNC_SECRET` api-task) | như finance |
| `chat`, `meeting` | `SYNC_CHAT_*`, `SYNC_MEETING_*` | chỉ user (hợp đồng cũ: `POST users` upsert, `POST users/delete`); đổi nhóm quyền → gửi lại user (cờ admin) |

Hợp đồng finance/task (giống nhau): `POST users` (upsert) + `POST users/lock`, `POST users/delete`
`{json_list:[{user_id}], lu_user_id}`, `POST user-roles` `{user_role_list, created_by_user_id}` (thay toàn
bộ theo user), `POST user-roles/clear` `{user_id, updated_by_id}`, `POST {branches,departments,positions,roles}`
(upsert) và `…/delete` `{json_list:[{<id>}], updated_by_id}`.

Tắt 1 đích: để trống secret hoặc `SYNC_DISABLED_TARGETS=finance,...` (dùng khi app đó chạy độc lập
`STANDALONE_ORG_ADMIN=true`).

## Thương hiệu (26/09/2026)

| Method | Path | Quyền | Việc gì |
| --- | --- | --- | --- |
| GET | `/branding` | công khai | Thông tin thương hiệu (`a_org_setting`), ảnh đã là URL tải được (`null` = file mặc định sso-web). `Cache-Control: max-age=60`, cache bộ nhớ 60s |
| PUT | `/admin/branding` | admin | `{ org_name, short_name, app_name, tagline?, login_heading?, login_description?, primary_color (#RRGGBB), footer_text? ({year} = năm hiện tại), footer_links: [{label, url (http(s):// hoặc /)}] ≤8 }` |
| POST | `/admin/branding/{kind}` | admin | multipart `file`; `kind` = `logo_light` \| `logo_dark` (png/jpg/webp ≤2MB) \| `favicon` (png/ico ≤512KB) \| `login_background` (≤5MB). **Không nhận SVG** (cùng origin sso-web → XSS). Lưu `uploads/branding/<kind>-<uuid>.<ext>`, xoá file cũ |
| DELETE | `/admin/branding/{kind}` | admin | Về ảnh mặc định |
| GET | `/render-page?path=` (hoặc header `X-Original-Path`) | công khai | `index.html` của sso-web (khuôn `SSO_WEB_TEMPLATE_URL`, cache 5 phút) với khối `<!-- branding-meta:start/end -->` thay bằng title/description/Open Graph/favicon lấy từ DB - để bot xem trước link (không chạy JS) thấy đúng thương hiệu. nginx/IIS sso-web gọi cho mọi request trang; bỏ header CSP của API. Chưa cấu hình khuôn → 503 (nginx rơi về `index.html` tĩnh) |
