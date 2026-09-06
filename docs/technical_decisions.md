# Technical Decisions

Quyết định kỹ thuật + lý do — không lặp lại "làm gì" (đã có ở [`architecture.md`](./architecture.md)),
tập trung "tại sao chọn thế này, đánh đổi gì".

## RS256 + JWKS thay vì `JWT_SECRET` dùng chung

**Chọn:** `api-sso` ký token bằng private key RS256, giữ **duy nhất**; các service khác verify bằng
public key lấy qua `GET /.well-known/jwks.json` (package `jwks-rsa`, tự cache theo `kid`). **Vì sao:**
với secret đối xứng cũ, lộ secret ở **bất kỳ service nào** trong số verify nó là giả mạo được token toàn
hệ thống; RS256 tách "ai ký được" (chỉ `api-sso`) khỏi "ai verify được" (mọi service, chỉ cần key công
khai). Đánh đổi: thêm 1 network round-trip lấy JWKS lần đầu mỗi service (có cache 10 phút, không đáng
kể), và xoay khoá cần thêm khoá mới vào JWKS trước khi phát hành token với `kid` mới (`config/jwt.ts`
`kid` đổi được qua env, không cần đổi code).

## Cookie domain cha — dùng chung được giữa nhiều app

**Chọn:** cookie `Domain=.{domain-cha}` thay vì host-only. **Vì sao:** SSO đúng nghĩa cần 1 phiên đăng
nhập dùng lại được ở `build-web`/`sso-web`/app tương lai (chat/meeting) — cookie host-only chỉ đúng 1
origin. Đánh đổi: mọi app tham gia SSO phải nằm trên subdomain của **cùng 1 domain cha** — không dùng
được cho app ở domain hoàn toàn khác (case đó cần OAuth2/OIDC redirect flow thật, ngoài phạm vi hiện
tại).

## Thu hồi phiên: đánh đổi độ trễ so với hiệu năng

**Chọn (chốt lại 06/09/2026):** `requireAuth` tra DB (`SessionRepository.isSessionActive`) **mỗi
request** vào `/account/*`/`/apps`/`/admin/*`, không chỉ tin chữ ký JWT còn hạn. **Vì sao:** access
token tự xác thực bằng chữ ký — nếu chỉ verify chữ ký, 1 access token đã phát hành trước khi user bị
thu hồi (đổi mật khẩu, admin khoá tài khoản...) vẫn dùng được tới khi hết hạn tự nhiên (tối đa 15
phút/1 ngày nếu remember) dù `/logout`/thu hồi phiên đã chạy — độ trễ đó không chấp nhận được cho chính
API của api-sso (account/admin). **Đánh đổi:** thêm 1 query DB mỗi request thay vì verify JWT thuần
(rẻ, nhưng không phải "miễn phí" như JWT stateless thường được quảng cáo). **Giới hạn còn lại:**
`api-task-management`/`api-gateway` **không** làm bước tra DB này (chỉ verify JWKS) — thu hồi phiên vẫn
có độ trễ tối đa bằng hạn access token cho các API **nghiệp vụ** (task, tài chính...), chỉ riêng API của
chính `api-sso` là thu hồi tức thời. Muốn thu hồi tức thời toàn hệ thống cần mọi service tự tra DB hoặc
access token ngắn hơn nhiều — chưa làm, đánh đổi phức tạp/hiệu năng chưa đáng lúc này.

## Stored procedure cho mọi thao tác đụng bảng dùng chung (chốt giữa phiên, không nhất quán từ đầu)

**Bối cảnh:** `a_session`/`a_refresh_token`/`a_password_reset_token` (milestone sandbox ban đầu) viết
bằng SQL thuần qua `db.raw()` — bảng hoàn toàn mới, riêng của `api-sso`, không có quy ước cũ nào ràng
buộc. Khi thêm tính năng "Quản lý tài khoản" (hồ sơ, đổi mật khẩu, avatar), bản đầu cũng viết SQL thuần
trong repository (join `system_users`/`user_profiles`/`employee`...). **User phản hồi trực tiếp: mọi
nghiệp vụ phải nằm trong stored procedure, không viết trong code** — đúng quy ước DB-wide đã có sẵn ở
`api-core`/`api-task-management`. **Sửa lại:** toàn bộ thao tác hồ sơ/mật khẩu/avatar/quản lý app viết
lại thành proc `a_*` (migration `0004`, `0005`), repository chỉ còn `CALL`. **Vì sao chấp nhận:** nghiệp
vụ tập trung ở 1 nơi (DB) thay vì rải ở tầng app, khớp cách toàn bộ hệ thống vận hành — dù nghĩa là mọi
thay đổi nhỏ (thêm field) cũng phải qua thêm 1 migration thay vì sửa code TypeScript thuần.

## Quên mật khẩu: token hash 1 lần thay vì gửi mật khẩu ngẫu nhiên qua email

**Chọn:** sinh token ngẫu nhiên 32 byte, chỉ lưu SHA-256 hash + hạn 1 giờ + `used_at` (dùng 1 lần) vào
`a_password_reset_token`; email chỉ chứa link `?token=<raw>`. **Vì sao:** cách cũ (một số hệ thống sinh
sẵn mật khẩu mới gửi qua email) để lộ mật khẩu thật trong hộp thư (không xoá được, log email server có
thể giữ lại); token 1 lần + hash giống hệt quy ước lưu mật khẩu (không lưu giá trị dùng để xác thực ở
dạng đọc được). Đánh đổi: cần 1 bước UI phụ (`sso-web` `ResetPasswordPage`) thay vì chỉ "gửi mật khẩu
mới" xong luôn.

## Đăng nhập bằng nhiều định danh mà không sửa stored procedure gốc

**Chọn:** `resolveUsername()` tra `system_users`/`user_profiles` bằng SELECT thuần, quy `username`/
`email`/`số điện thoại` về đúng `user_name`, rồi mới gọi `CALL "GetUserByAccount"` (chỉ nhận
`user_name`, không sửa được vì dùng chung với `api-core`). **Vì sao:** sửa proc gốc rủi ro ảnh hưởng
`api-core` (không kiểm soát được hết nơi gọi), trong khi 1 SELECT phụ trước đó là thay đổi an toàn, cô
lập hoàn toàn trong `api-sso`.

## `api-core` giữ nguyên, không sửa

**Chọn:** route `login/refresh/logout/me` cũ trong `api-core` **không đổi 1 dòng** — build-web chỉ đơn
giản không gọi tới nữa (chuyển hẳn sang `api-sso`). **Vì sao:** giảm rủi ro deploy — sửa `api-core` là
sửa 1 service đang chạy production thật cho nhiều nghiệp vụ khác (user/role/branch/department), trong
khi mục tiêu chỉ là tách auth ra. Đánh đổi: `api-core` còn giữ code auth cũ đã "chết" (không ai gọi) —
chấp nhận được, dọn sau nếu cần.

## `sso-web` là frontend độc lập, không phải trang tĩnh do `api-sso` phục vụ

**Chọn:** `sso-web` build/deploy như 1 app riêng (Vite+React), gọi API cross-origin sang `api-gateway`
— không phải HTML tĩnh trong `api-sso/public`. **Vì sao:** thử phương án phục vụ qua gateway trước
(đơn giản hơn, same-origin), nhưng giao diện cần đầy đủ (toast, dark mode, form quên mật khẩu, trang
quản lý tài khoản nhiều tab) khiến HTML+JS thuần không hợp lý — đổi hướng sang 1 SPA đầy đủ, giống
`build-web`. Đánh đổi: cần cấu hình CORS riêng (`SSO_ORIGIN`, tách khỏi `CORS_ORIGIN` của build-web —
gói `cors` coi origin string là 1 literal, không tự tách theo dấu phẩy để match nhiều origin).

## Phân quyền ứng dụng: bảng DB thay config tĩnh, cấp theo người không theo role

**Chọn:** `a_app`/`a_app_access` (cấp quyền theo **từng user_id**) thay cho mảng `SSO_APPS` hard-code
trong code, và thay cho phương án cấp theo role. **Vì sao không cấp theo role:** yêu cầu gốc là "mỗi
ứng dụng chọn người được phép truy cập" — role-based sẽ cần thêm 1 lớp gián tiếp (role → app) không ai
yêu cầu, trong khi user-based đơn giản hơn và đúng UX "multi-select người dùng" mà trang quản trị cần.
**"Admin" tái dùng role có sẵn (`role_code='sa'`)** thay vì tạo khái niệm quyền mới — nhất quán với
cách hệ thống đã hiểu "quản trị hệ thống" từ trước (`roles` table, từng dùng ở `api-gateway` bản cũ).
