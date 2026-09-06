# Migration database của API SSO

Thư mục `migrations/` là nguồn chính thức cho mọi thay đổi bảng, index và stored procedure của module SSO. Không sửa trực tiếp database sandbox hoặc production mà không tạo migration tương ứng tại đây.

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

Bản sửa kiểm tra phiên bị thu hồi ngày 06/09/2026 chỉ thay đổi logic API/JWT và dùng các cột đã có (`session_id`, `user_id`, `revoked_at`, `expires_at`), vì vậy không phát sinh migration SQL mới.

## Quy tắc lưu vết

1. Mỗi thay đổi database mới tạo một file mới; không sửa nội dung migration đã chạy trên production.
2. Tên file theo mẫu `NNNN_mo_ta.sql`, số tăng tuần tự.
3. Đầu file phải ghi mục đích, thứ tự áp dụng và câu lệnh rollback tham khảo.
4. Migration phải chạy lại an toàn khi có thể: dùng `IF NOT EXISTS`, `CREATE OR REPLACE` hoặc guard tương đương.
5. Thay đổi procedure hiện hữu vẫn phải tạo migration mới bằng `CREATE OR REPLACE PROCEDURE`; không sửa ngược file `0004` sau khi đã phát hành production.
6. Mọi migration phải được chạy thử trên sandbox qua `sandbox-restore` trước khi áp dụng lên database thật.

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
