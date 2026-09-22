# Database

`api-sso` **không có database riêng** — đọc/ghi thẳng `build_management` (cùng DB với `api-core`/
`api-task-management`, remote, không phải container local). Không tạo DB mới, không di trú dữ liệu
người dùng — `system_users`/`user_profiles`/`roles`... vẫn do `api-core` "sở hữu" theo nghĩa vai trò
nghiệp vụ, `api-sso` chỉ đọc lại qua stored procedure có sẵn (không sửa proc gốc).

Migration nằm ở [`db/migrations/`](../db/migrations) (đánh số `NNNN_*.sql`, idempotent — `CREATE TABLE
IF NOT EXISTS`/`CREATE OR REPLACE PROCEDURE`), chạy tay theo đúng thứ tự lên `build_management` — xem
quy tắc đầy đủ ở [`db/README.md`](../db/README.md).

## Bảng repo này sở hữu (tiền tố `a_`, module auth/SSO — giống `t_` của task)

| Bảng | Vai trò | Cột đáng chú ý |
| --- | --- | --- |
| `a_session` | Phiên đăng nhập thu hồi được | `session_id` (PK), `user_id`, `expires_at`, `revoked_at`, `remember` (audit lý do hạn dùng), `user_agent` (`varchar(512)` từ migration `0013`, `SessionRepository.createSession` tự cắt 512 ký tự — UA webview có thể dài hơn, không cắt thì `INSERT` lỗi và đăng nhập trả 500; token nhận diện app như `FBAN` nằm cuối UA nên không để giới hạn quá thấp)/`ip` (`varchar(64)`, cũng cắt) |
| `a_refresh_token` | Refresh token gắn với 1 `a_session` | `jti` (PK), `session_id`, `expires_at`, `revoked_at`, `rotated_to` (để sẵn cho rotation — **chưa bật**) |
| `a_password_reset_token` | Token "quên mật khẩu" 1 lần | `token_hash` (PK, SHA-256 — **không lưu token thật**), `expires_at` (1 giờ), `used_at` |
| `a_app` | Danh sách app hiển thị ở trang chủ `sso-web` (thay config tĩnh cũ) | `app_id` (PK), `app_key` (slug, unique **có điều kiện** `WHERE active_flag=1`), `app_name`, `url`, `color`, `icon`, `sort_order`, `active_flag` (soft-delete) |
| `a_app_access` | Cấp quyền truy cập app theo **từng người** | `(app_id, user_id)` PK kép — không cấp theo role |

`a_session`/`a_refresh_token` là 2 bảng **đầu tiên** của `api-sso` (milestone sandbox ban đầu) — thao
tác qua SQL thuần (`db.raw()`, xem `repositories/sessionRepository.ts`), **không** qua stored procedure
như quy ước chung của DB này, vì đây là bảng hoàn toàn mới, tự `api-sso` sở hữu, không đụng bảng dùng
chung. Từ `a_password_reset_token` trở đi vẫn SQL thuần vì lý do tương tự (bảng riêng, thao tác đơn
giản). Ngược lại, **mọi thao tác đụng tới bảng dùng chung** (`system_users`/`user_profiles`/`employee`)
— hồ sơ tài khoản, đổi mật khẩu, danh sách app — đều đi qua stored procedure (`a_*`), theo đúng quy ước
DB-wide (mọi nghiệp vụ nằm trong proc, xem `api-task-management/docs/database.md` mục "Quy ước stored
procedure"). Đây là quyết định chốt lại giữa chừng phiên làm việc, không phải nhất quán ngay từ đầu —
xem [`technical_decisions.md`](./technical_decisions.md).

## Job dọn dữ liệu xác thực

`src/jobs/dataCleanupJob.ts` chạy định kỳ trong process, mặc định mỗi 24 giờ và trì hoãn 2 phút sau khi
service khởi động. Job xóa theo batch nhỏ: password-reset token hết hạn/đã dùng quá 7 ngày, sau đó
refresh token và session hết hạn/đã thu hồi quá 30 ngày. Refresh token luôn được xóa trước session vì có
khóa ngoại. PostgreSQL advisory lock ngăn nhiều instance cùng xóa một batch; timer cũng chặn hai lượt
trong cùng process chồng nhau. Cùng job quét `uploads/avatars` và xóa file quá grace period không còn
được `user_profiles.avatar` tham chiếu; thư mục avatar rỗng cũng được dọn. Avatar hiện tại không bị xóa.

Biến môi trường: `DATA_CLEANUP_ENABLED`, `DATA_CLEANUP_DRY_RUN`, `DATA_CLEANUP_INTERVAL_MS`,
`DATA_CLEANUP_INITIAL_DELAY_MS`, `DATA_CLEANUP_BATCH_SIZE`, `DATA_CLEANUP_MAX_BATCHES`,
`SESSION_RETENTION_DAYS`, `PASSWORD_RESET_TOKEN_RETENTION_DAYS`, `ORPHAN_AVATAR_GRACE_HOURS`,
`ORPHAN_AVATAR_MAX_FILES_PER_RUN`. Khi triển khai lần đầu có thể bật
`DATA_CLEANUP_DRY_RUN=true` để chỉ đếm và ghi log. Migration `0012_cleanup_indexes.sql` phải được áp
dụng trước khi bảng đã lớn để truy vấn retention không full-scan.

## Stored procedure repo này sở hữu

Toàn bộ theo khuôn `OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message varchar` (giống hệt
quy ước ở `api-core`/`api-task-management`) — `Database.query()`/`queryList()` (`config/database.ts`)
unwrap 3 `OUT` này thống nhất.

| Proc | Migration | Việc gì |
| --- | --- | --- |
| `a_GetAccountProfile(user_id)` | 0004, sửa lại ở 0005 (thêm `is_admin`) | Hồ sơ đầy đủ cho `GET /account/profile` — JOIN `positions`/`department`/`branch` để có tên hiển thị |
| `a_GetUserPasswordHash(user_id)` | 0004 | Trả hash hiện tại — verify bằng bcrypt ở tầng app |
| `a_SetUserPassword(user_id, new_password, lu_user_id)` | 0004 | Ghi mật khẩu **đã hash sẵn** as-is. Dùng cho cả đổi mật khẩu lẫn nâng cấp hash MD5→bcrypt lúc login |
| `a_UpdateSelfProfile(user_id, full_name, email, phone, gender, dob, lu_user_id)` | 0004 | Chỉ sửa `user_profiles` (+ đồng bộ `employee.fullname/email/phone_number`) — **không đụng** branch/department/position/type |
| `a_SetAvatar(user_id, avatar, lu_user_id)` | 0004 | Chỉ `user_profiles.avatar` |
| `a_IsUserAdmin(user_id)` — **FUNCTION**, không phải procedure | 0005 | `true` nếu có role active `role_code='sa'`. Gọi qua `SELECT`, không phải `CALL` |
| `a_UserHasAppAccess(user_id, app_key)` — **FUNCTION** | 0006 | `true` nếu admin, hoặc có dòng `a_app_access` khớp `app_key` (app phải `active_flag=1`). Dùng ở `GET /me?app=` — chốt chặn thật, không chỉ ẩn/hiện UI, xem `api.md` |
| `a_ListAppsForUser(user_id)` | 0005 | Admin thấy mọi app active; người khác chỉ thấy app có trong `a_app_access` |
| `a_AdminListApps()` | 0005, 0011, 0014 | Toàn bộ app active kèm `direct_access_count`, `eligible_user_count`, `effective_access_count`; chỉ đếm hồ sơ active. 0014: `direct`/`eligible` loại admin `sa` (tỉ lệ ≤ 100%), `effective` vẫn tính admin |
| `a_ListAppIcons()` | 0015 | Trả đường dẫn icon của các app active để ghép vào danh sách app. |
| `a_AdminSetAppIcon(app_id, icon, lu_user_id)` | 0015 | Ghi đường dẫn icon vào `a_app.icon` sau upload. |
| `a_AdminUpsertApp(app_id, app_key, app_name, description, url, color, sort_order, lu_user_id)` | 0005 | `app_id` rỗng = tạo mới (check trùng `app_key`); có giá trị = cập nhật |
| `a_AdminDeleteApp(app_id, lu_user_id)` | 0005 | Xoá mềm `a_app` + xoá cứng toàn bộ `a_app_access` liên quan |
| `a_AdminListAppAccess(app_id)` | 0005, 0008, 0014 | JOIN ra tên/chức vụ người đã được cấp, loại admin (0007 từng seed cả admin vào `a_app_access`, dòng đó vô nghĩa vì admin bypass) |
| `a_AdminSetAppAccess(app_id, user_ids jsonb, lu_user_id)` | 0005 | **Thay toàn bộ** tập quyền (`DELETE` rồi `INSERT` lại), không cộng/trừ từng dòng |
| `a_AdminListUsers()` | 0005, 0008, 0014 | User active **trừ admin `sa`** cho modal quyền (0014 thêm loại admin) |
| `a_AdminListAppAccessCandidates(app_id, keyword, position_id, page, page_size)` | 0011 | User active chưa có grant, loại admin bypass; tìm theo tên/tài khoản, lọc chức vụ và phân trang |
| `a_AdminAddAppAccess(app_id, user_ids jsonb, lu_user_id)` | 0011 | Cộng grant hợp lệ theo delta, idempotent; bỏ qua user inactive/admin/đã có quyền |
| `a_AdminRemoveAppAccess(app_id, user_ids jsonb)` | 0011 | Gỡ đúng các grant được chỉ định, idempotent |
| `a_FilterUsersWithAppAccess(app_key, user_ids jsonb)` — **FUNCTION**, trả `TABLE(user_id)` | 0009 | Lọc 1 tập user, giữ lại người `a_UserHasAppAccess(user_id, app_key)` = true (chỉ bọc lại hàm đó, không lặp logic). Gọi qua `SELECT ... FROM`, không `CALL`. Dùng ở route nội bộ `POST /internal/app-access/filter` (api-task lọc màn Phân quyền công trình theo app `task`) |

## Bảng dùng chung (đọc/ghi qua proc có sẵn hoặc SELECT trực tiếp, không sở hữu — thuộc `api-core`)

| Bảng | Dùng để |
| --- | --- |
| `system_users` | Đăng nhập (`user_name`/`password`/`type`/`active_flag`), khoá `user_id varchar` (không phải uuid) |
| `user_profiles` | Hồ sơ hiển thị (`full_name`/`email`/`phone_number`/`avatar`/`gender`/`date_of_birth`) |
| `employee` | `branch_id`/`department_id`/`position_id` — `employee_id = system_users.user_id` (1-1) |
| `positions`, `department`, `branch` | JOIN lấy tên hiển thị cho hồ sơ tài khoản |
| `roles`, `user_roles` | Nguồn "admin" (`role_code = 'sa'`) — xem `a_IsUserAdmin` |

Stored procedure gốc **đọc lại, không sửa**: `GetUserByAccount` (đăng nhập — trả cả `role_group` dạng
chuỗi `string_agg(role_code, ', ')`), `GetUserById`/`GetFunctionByUserId`/`GetActionByUserId` (dùng cho
`/me`), `ResetPassword`/`ResetPasswordByAdmin` (đọc để tham khảo khuôn, **không còn gọi** —
`a_SetUserPassword`/`a_UpdateSelfProfile` đã thay thế phần liên quan tới tài khoản tự phục vụ).

## Điều tra DB trực tiếp

Không có ORM/ORM migration tool đọc schema từ code (giống `api-core`/`api-task-management`). Dùng `pg`
đã có sẵn trong `node_modules` để query trực tiếp khi cần xác minh:

```bash
docker exec api-sso node -e "
const {Client}=require('pg');
const c=new Client({host:process.env.DB_HOST,port:+process.env.DB_PORT,user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
c.connect().then(()=>c.query('SELECT ...')).then(r=>console.log(r.rows)).then(()=>c.end());
"
```

Chỉ chạy `SELECT`/`pg_get_functiondef()` để điều tra — không chạy `INSERT`/`UPDATE`/`DDL` qua đường
này, đổi schema luôn phải qua file migration mới (xem `db/README.md`).
