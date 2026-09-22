# Migration database của API SSO

Thư mục `migrations/` là nguồn chính thức cho mọi thay đổi bảng, index và stored procedure của module SSO. Không sửa trực tiếp database production mà không tạo migration tương ứng tại đây.

## Danh sách migration

| Thứ tự | File | Thay đổi |
| --- | --- | --- |
| 0001 | `0001_create_a_session.sql` | Tạo bảng phiên đăng nhập `a_session` và index theo người dùng. |
| 0002 | `0002_create_a_refresh_token.sql` | Tạo bảng refresh token có khả năng thu hồi `a_refresh_token`. |
| 0003 | `0003_create_a_password_reset_token.sql` | Tạo bảng token đặt lại mật khẩu dùng một lần. |
| 0004 | `0004_account_stored_procs.sql` | Tạo/cập nhật các procedure hồ sơ, mật khẩu và avatar của tài khoản. |
| 0005 | `0005_app_registry.sql` | Bảng `a_app`/`a_app_access` (phân quyền ứng dụng theo người) + proc quản trị, seed 4 app (`finance`/`task`/`chat`/`meeting`). |
| 0006 | `0006_app_access_check.sql` | Hàm `a_UserHasAppAccess` — chặn thật ở `GET /me?app=`, không chỉ ẩn/hiện UI. |
| 0007 | `0007_seed_app_access_finance_task.sql` | Seed `a_app_access` cho **mọi user active hiện có** × app `finance`+`task` — bắt buộc trước khi `build-web`/`task-web` bật gửi `?app=` thật (07/09/2026), tránh khoá nhầm cả công ty lúc deploy. |
| 0008 | `0008_admin_users_avatar.sql` | Thêm cột `avatar` vào `a_AdminListUsers` / `a_AdminListAppAccess` — màn "Phân quyền truy cập app" (`sso-web`) hiện ảnh thật thay vì màu nền hash. |
| 0009 | `0009_internal_app_access_filter.sql` | Hàm `a_FilterUsersWithAppAccess(app_key, user_ids jsonb)` — bọc `a_UserHasAppAccess` cho cả tập. Dùng ở route nội bộ `POST /internal/app-access/filter` (api-task lọc màn Phân quyền công trình theo quyền app `task`, xem `api-task-management/docs/phan_quyen_giam_sat_app_gate.md`). |
| 0010 | `0010_session_timestamps_to_timestamptz.sql` | Đổi 4 cột giờ `a_session` + 3 cột `a_refresh_token` từ `timestamp` → `timestamptz`. DB chạy timezone Asia/Bangkok nên cột naive giữ "giờ treo tường ICT", driver `pg` đọc lệch → màn "Phiên đăng nhập" hiện "Hoạt động vừa xong" cho mọi phiên. Tính lại `expires_at` cũ (bị lệch) từ `created_at + TTL`. **Chạy 1 lần, không idempotent.** |
| 0011 | `0011_admin_app_access_delta.sql` | Count quyền trực tiếp/đủ điều kiện/hiệu lực, danh sách ứng viên có lọc + phân trang, và proc cộng/gỡ quyền idempotent theo delta. |
| 0012 | `0012_cleanup_indexes.sql` | Index theo thời hạn/thu hồi cho job tự động dọn session, refresh token và password-reset token cũ. |
| 0013 | `0013_a_session_user_agent_512.sql` | Nâng `a_session.user_agent` từ `varchar(255)` lên `varchar(512)` (chỉ đổi metadata, không rewrite bảng). UA webview dài 300-400 ký tự và token nhận diện app (FBAN/FBAV) nằm cuối chuỗi — cắt ở 255 làm mất token. **Chạy TRƯỚC khi deploy code cắt 512 ký tự.** Đã áp dụng lên DB thật 20/09/2026. |
| 0015 | `0015_app_icon.sql` | Thêm `a_app.icon` và hai procedure `a_ListAppIcons`, `a_AdminSetAppIcon`; API đọc đường dẫn từ DB và cập nhật sau upload. |

Bản sửa kiểm tra phiên bị thu hồi ngày 06/09/2026 chỉ thay đổi logic API/JWT và dùng các cột đã có (`session_id`, `user_id`, `revoked_at`, `expires_at`), vì vậy không phát sinh migration SQL mới.

## Quy tắc lưu vết

1. Mỗi thay đổi database mới tạo một file mới; không sửa nội dung migration đã chạy trên production.
2. Tên file theo mẫu `NNNN_mo_ta.sql`, số tăng tuần tự.
3. Đầu file phải ghi mục đích, thứ tự áp dụng và câu lệnh rollback tham khảo.
4. Migration phải chạy lại an toàn khi có thể: dùng `IF NOT EXISTS`, `CREATE OR REPLACE` hoặc guard tương đương.
5. Thay đổi procedure hiện hữu vẫn phải tạo migration mới bằng `CREATE OR REPLACE PROCEDURE`; không sửa ngược file `0004` sau khi đã phát hành production.
6. Mọi migration nên chạy thử trên bản clone/staging trước khi áp dụng lên database thật.

## Áp dụng lên database thật

Sao lưu database trước, sau đó chạy các file theo đúng thứ tự tên:

```sh
for file in api-sso/db/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f "$file"
done
```

Không đưa mật khẩu hoặc connection string thật vào repository. Truyền kết nối qua `DATABASE_URL` hoặc các biến môi trường `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` và `PGPASSWORD` tại thời điểm triển khai.

Sau khi chạy, kiểm tra tối thiểu:

```sql
SELECT to_regclass('public.a_session');
SELECT to_regclass('public.a_refresh_token');
SELECT to_regclass('public.a_password_reset_token');

SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE 'a_%'
ORDER BY routine_name;
```
