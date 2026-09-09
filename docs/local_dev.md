# Chạy cả cụm hệ thống ở local

Tài liệu này nằm trong `api-sso` vì lý do đơn giản: từ khi có cơ chế phân quyền ứng dụng (`?app=`, xem
[`technical_decisions.md`](./technical_decisions.md) mục "Enforce quyền app ở /me"), **mọi frontend đều
phải có `api-sso` chạy được** thì mới qua khỏi màn hình loading — không còn cách nào "chạy tắt" 1 app
riêng lẻ không cần SSO nữa. Nội dung dưới đây nói về cách chạy **toàn bộ cụm** (không chỉ riêng
`api-sso`) — xem [`README.md`](../README.md) ở gốc `api-sso` nếu chỉ cần chạy đúng service này.

## 1. Danh sách service + port mặc định (local)

| Service | Port | Cách chạy | Ghi chú |
| --- | --- | --- | --- |
| `api-core` | 6001 | `pnpm start` | Users/roles/branch/department (DB `build_management`) |
| `api-sso` | 6005 | `pnpm start` | Auth (login/refresh/logout/me), phân quyền app |
| `api-task-management` | 6002 | `pnpm start` | Module Nhiệm vụ |
| `api-gateway` | 6688 | `pnpm start` | Cổng vào duy nhất — mọi frontend chỉ gọi qua đây |
| `build-web` | 3010 | `pnpm dev` | Quản trị hệ thống + Tài chính |
| `task-web` | 3011 | `pnpm dev` | Nhiệm vụ (fork từ build-web) |
| `sso-web` | 5173 | `pnpm dev` | Trang đăng nhập + trang chủ liệt kê app + quản lý tài khoản |

Không cần chạy hết cả 7 — chỉ cần `api-gateway` + `api-sso` + đúng backend/frontend đang sửa (xem
mục 3). `api-core` gần như luôn cần theo (đăng nhập đọc `system_users`/`user_profiles` ở đó).

## 2. Vì sao `api-sso` là bắt buộc, kể cả khi chỉ sửa UI

`AppLayout.tsx` (build-web/task-web) và `RequireAuth.tsx` (sso-web) đều gọi `GET /me?app=<app_key>`
lúc khởi động, **trước khi** render bất kỳ gì khác. Không có `api-sso` (hoặc `api-gateway` không route
tới được nó) thì request này treo/lỗi mạng, app kẹt ở màn hình loading vĩnh viễn — không phải bug, đây
là hành vi cố ý (không cho vào giao diện khi chưa xác định được có đăng nhập/có quyền hay không, xem
`AppLayout.tsx` comment "Chưa biết đã đăng nhập hay chưa... không render trang được bảo vệ").

## 3. Thứ tự khởi động

1. **Xác định service nào đang sửa**, rồi chỉ cần chạy đúng nhóm dưới đây (không phải chạy hết):
   - Sửa `build-web`/`task-web`: cần `api-gateway` + `api-sso` + `api-core` (+ `api-task-management`
     nếu đụng module Nhiệm vụ).
   - Sửa `sso-web`: cần `api-gateway` + `api-sso` + `api-core`.
   - Sửa backend thuần (`api-core`/`api-sso`/`api-task-management`): không bắt buộc chạy frontend, test
     bằng `curl` qua gateway là đủ (xem [`api.md`](./api.md)).
2. **`pnpm install` ở từng service** — mỗi service là 1 package độc lập, không phải workspace chung.
3. Khởi động theo thứ tự: `api-core` → `api-sso` → `api-task-management` (nếu cần) → `api-gateway`
   (cần 3 URL trên sẵn sàng để verify được, dù gateway không crash nếu chúng chưa lên, chỉ là request
   đầu tiên sẽ lỗi kết nối) → cuối cùng mới tới frontend.
4. Mở trình duyệt bằng **`http://localhost:<port>`** — không dùng `http://127.0.0.1:<port>` cho bất kỳ
   service nào. Cookie phiên so khớp theo hostname (bỏ qua port) — `localhost` và `127.0.0.1` là 2
   hostname khác nhau dù trỏ cùng máy, trộn lẫn 2 cách gõ này là nguyên nhân phổ biến nhất khiến cookie
   phiên "biến mất" giữa các app lúc dev local.

## 4. Checklist `.env` trước khi chạy — đây là chỗ hay vướng nhất

- [ ] **`DB_HOST`/`DB_PORT`/`DB_NAME` của `api-core`, `api-sso` phải trỏ CÙNG 1 database
      (`build_management`); `api-task-management` trỏ `task_management` cùng server.** Nếu `api-sso` trỏ
      DB khác `api-core`, đăng nhập qua `api-sso` sẽ tạo phiên cho user mà `api-core` không biết là ai.
      Mặc định cả 3 đều trỏ `112.78.1.3` (DB thật) — kiểm tra khớp trước khi chạy.
- [ ] `api-gateway/.env`: `URL_CORE`/`URL_SSO`/`URL_TASK_MANAGEMENT`/`JWT_JWKS_URI` trỏ đúng port ở
      mục 1 (mặc định trong `.env.example` đã đúng, chỉ cần copy).
- [ ] `api-gateway/.env`: `CORS_ORIGIN` = origin `build-web` (`http://localhost:3010`). `task-web`/
      `sso-web` **không cần** thêm gì ở đây — cả 2 đều gọi gateway qua proxy của chính vite dev server
      (server-to-server), không phải browser gọi thẳng nên không bị CORS chặn (gateway không còn biến
      `SSO_ORIGIN` nữa, đã bỏ 07/09/2026).
- [ ] `api-sso/.env`: `COOKIE_DOMAIN` để **rỗng** khi chạy local (không set `=.xaydung.vn` hay tương
      tự) — cookie host-only theo đúng hostname `localhost`.
- [ ] `build-web/.env`, `task-web/.env`, `sso-web/.env`: `VITE_SSO_URL` — để rỗng thì build-web/task-web
      dùng route `/login` nội bộ cũ (không redirect sang `sso-web`); set
      `VITE_SSO_URL=http://localhost:5173` nếu muốn test đúng luồng chuyển hướng sang `sso-web` thật.

## 5. Tài khoản test chưa được cấp quyền app → 403 ngay cả khi đăng nhập đúng

`GET /me?app=<app_key>` fail-closed — tài khoản chưa có trong `a_app_access` (trừ vai trò quản trị hệ
thống, `role_code='sa'`, luôn qua) sẽ nhận `403`, hiện đúng trang "Không có quyền truy cập ứng dụng
này" (không phải bug, xem [`technical_decisions.md`](./technical_decisions.md)). Cấp quyền cho tài
khoản test qua trang quản trị app trong `sso-web` (`/account` → tab quản lý ứng dụng, cần đăng nhập
bằng tài khoản có vai trò quản trị), hoặc thẳng bằng SQL — xem
[`../db/migrations/0007_seed_app_access_finance_task.sql`](../db/migrations/0007_seed_app_access_finance_task.sql)
làm mẫu.

## 6. Xem thêm

- Từng service có `README.md`/`docs/` riêng, chi tiết hơn — file này chỉ nói tới việc **chạy được cả
  cụm** với nhau.
- [`../../api-task-management/docs/task_management_split_plan.md`](../../api-task-management/docs/task_management_split_plan.md)
  — bối cảnh tách `task-web`/`task_management`.
- [`technical_decisions.md`](./technical_decisions.md) — cơ chế phân quyền app, cookie domain cha,
  RS256/JWKS.
- Tài liệu dành cho đội tích hợp app **khác** (ngoài monorepo này) muốn dùng chung SSO: xem repo
  `artifacts` (`api/_content/sso-tich-hop-app-khac.html`), không phải file này.
