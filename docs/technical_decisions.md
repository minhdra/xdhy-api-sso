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

**Chọn:** `sso-web` build/deploy như 1 app riêng (Vite+React) — không phải HTML tĩnh trong
`api-sso/public`. **Vì sao:** thử phương án phục vụ qua gateway trước (đơn giản hơn), nhưng giao diện
cần đầy đủ (toast, dark mode, form quên mật khẩu, trang quản lý tài khoản nhiều tab) khiến HTML+JS
thuần không hợp lý — đổi hướng sang 1 SPA đầy đủ, giống `build-web`. Gọi API **same-origin** qua nginx
proxy của chính `sso-web` (cả dev lẫn production — xem `sso-web/docs/technical_decisions.md` mục "Gọi
API same-origin..."), nên `api-gateway` **không còn CORS/`SSO_ORIGIN` cho sso-web nữa** (đã xoá hẳn
07/09/2026, không phải chỉ để trống).

## Phân quyền ứng dụng: bảng DB thay config tĩnh, cấp theo người không theo role

**Chọn:** `a_app`/`a_app_access` (cấp quyền theo **từng user_id**) thay cho mảng `SSO_APPS` hard-code
trong code, và thay cho phương án cấp theo role. **Vì sao không cấp theo role:** yêu cầu gốc là "mỗi
ứng dụng chọn người được phép truy cập" — role-based sẽ cần thêm 1 lớp gián tiếp (role → app) không ai
yêu cầu, trong khi user-based đơn giản hơn và đúng UX "multi-select người dùng" mà trang quản trị cần.
**"Admin" tái dùng role có sẵn (`role_code='sa'`)** thay vì tạo khái niệm quyền mới — nhất quán với
cách hệ thống đã hiểu "quản trị hệ thống" từ trước (`roles` table, từng dùng ở `api-gateway` bản cũ).

## Enforce quyền app ở `/me`, không chỉ ẩn/hiện UI

**Bối cảnh:** bản đầu của "phân quyền ứng dụng" chỉ lọc kết quả `GET /apps` (trang chủ `sso-web` không
hiện tile app chưa được cấp) — **không** có gì chặn ở tầng backend. User chỉ ra đúng lỗ hổng: ai có
cookie hợp lệ (đăng nhập thành công) vẫn gõ thẳng URL vào được bất kỳ app nào, vì `build-web`/
`api-task-management`/`api-gateway` chỉ verify chữ ký JWT (xác thực), không biết gì về `a_app_access`
(phân quyền). **Chọn:** thêm tham số `?app=<app_key>` cho `GET /me` — app nào muốn tự bảo vệ tự gọi
`/me` kèm `app_key` của mình (thường đã có sẵn lời gọi `/me` lúc bootstrap để biết "đã đăng nhập
chưa", chỉ cần thêm query param), `api-sso` trả 403 nếu không có quyền. **Vì sao chọn `/me` thay vì
thêm hạ tầng gateway riêng:** tái dùng đúng lời gọi mọi app đã có sẵn, không cần thêm policy/pipeline
mới ở `api-gateway` cho từng app — đúng tinh thần tối thiểu, một chỗ. **Vì sao tra DB trực tiếp (qua
hàm `a_UserHasAppAccess`) thay vì nhúng danh sách app được phép vào JWT claim:** thu hồi quyền có hiệu
lực ngay lập tức (không đợi access token hết hạn/refresh), cùng triết lý với cách `requireAuth` đã tra
`isSessionActive` mỗi request — đổi lại là 1 query DB thêm mỗi lần app gọi `/me?app=`, chấp nhận được vì
đây thường chỉ là 1 lần lúc bootstrap, không phải mỗi API nghiệp vụ.

**Fail-closed khi `app_key` sai/không active:** cân nhắc giữa "bỏ qua kiểm tra nếu app_key lạ" (dễ debug
hơn) và "coi như không có quyền" (an toàn hơn) — chọn vế sau, vì gõ sai tên app_key (lỗi đánh máy khi
tích hợp) không được phép vô tình tắt luôn lớp bảo vệ.

**Mở rộng (09/09/2026) — route nội bộ `/internal/app-access/filter` cho phép service khác lọc theo
quyền app.** `api-task-management` cần: danh sách thêm người ở màn Phân quyền công trình chỉ gồm người
có quyền app `task` (DB `task_management` tách khỏi `build_management` nên không JOIN được `a_app_access`
trực tiếp). **Chọn HTTP nội bộ lúc đọc** (KHÔNG cache — cấp/thu quyền hiệu lực ngay, fail-closed) thay vì (a) đồng bộ
`a_app_access` sang `task_management` — thêm hạ tầng sync producer ở api-sso vốn chưa từng đẩy gì đi,
eventual consistency; hay (b) dblink cross-DB — nhúng credential vào SQL, coupling schema. **Endpoint
batch** `{ app_key, user_ids[] }` → `{ allowed_user_ids[] }` thay vì N lần gọi `a_UserHasAppAccess`:
1 round-trip, và giữ nguyên tắc "admin bypass + fail-closed" nằm trong DB (`a_FilterUsersWithAppAccess`
chỉ bọc lại `a_UserHasAppAccess`, không lặp logic ở TS). **Mount `/internal` ngoài `/api-sso`** — gateway
chỉ rewrite `/api/api-sso/*`, không có đường từ ngoài tới `/internal/*` (giống `api-task-management` với
`/internal/sync`). **Internal secret thứ 2 trong hệ** (`INTERNAL_SECRET` ↔ `SSO_INTERNAL_SECRET` bên
api-task; thứ nhất là `TASK_SYNC_SECRET` cho api-core → api-task): cùng mô hình 1 secret tĩnh qua header,
defense-in-depth cộng thêm lên network isolation. Chi tiết:
[`../../api-task-management/docs/phan_quyen_giam_sat_app_gate.md`](../../api-task-management/docs/phan_quyen_giam_sat_app_gate.md).

**Đã bật thật (07/09/2026):** sau khi tách `task-web` khỏi `build-web` (xem
`api-task-management/docs/task_management_split_plan.md`), cả 2 app đều gọi `/me` kèm `?app=` —
`build-web` dùng `app_key="finance"` (còn lại administration + tài chính sau khi tách task, không có
app_key riêng cho administration trong 4 app đã seed), `task-web` dùng `app_key="task"`
(`src/constant/config.ts` mỗi app). Đủ cả 3 điều kiện từng liệt kê ở đây trước khi bật: (1) app_key đã
chọn xong ở trên, (2) `a_app_access` đã seed cho toàn bộ user active hiện có × 2 app_key này
(migration `0007_seed_app_access_finance_task.sql`, tránh khoá nhầm cả công ty), (3) cả 2 app đã tách
trạng thái `authStatus="forbidden"` riêng (khác `"unauthenticated"`) trong bootstrap `/me` — 403 hiện
trang "Không có quyền truy cập ứng dụng này" + nút đăng xuất, KHÔNG đá về trang login (interceptor
axios ở tầng gọi API *sau* bootstrap vốn đã phân biệt đúng từ trước, chỉ riêng lời gọi `/me` bootstrap
ban đầu là gộp chung — đây là chỗ đã sửa). Verify end-to-end trên sandbox: mint JWT thật + session hợp
lệ, gọi `/me?app=finance` trả 200 lúc có quyền, xoá `a_app_access` → 403 ngay lập tức, thêm lại → 200
lại.

## `/me` và `/account/profile` trả URL avatar sẵn sàng, không phải path thô (09/09/2026)

**Bối cảnh:** `user_profiles.avatar` lưu 2 dạng —
`/api-sso/uploads/avatars/<username>--<user_id>/<uuid>.jpg` (avatar api-sso upload; avatar api-sso cũ
không có cấp user vẫn tương thích) và
`uploads\yyyy-mm-dd\ten file.png` (avatar cũ do api-core lưu, backslash, tên có dấu cách /
`[]` / `()`). Trước đây `/me` trả nguyên chuỗi này, mỗi FE (`sso-web` `avatarSrc()`, `task-web`/
`build-web` `resolveUploadUrl()`) tự ghép prefix + tự xử lý backslash. Avatar api-core mở ra URL
`/api/api-core/uploads/...` **không hiện** vì gateway pipeline `/api/api-core/*` có `verifyAdmin-token` —
`<img>` không kèm được cookie/session ổn định trong mọi ngữ cảnh (tab khác, subdomain khác).

**Sửa:**
1. **api-gateway**: thêm `coreUploadsPipeline` cho `/api/api-core/uploads/*` — KHÔNG verify token
   (avatar không phải dữ liệu nhạy cảm; api-core cũng serve static không auth ở tầng service). Khai
   TRƯỚC `api_core` để bắt trước. Giống `/api/api-sso/uploads/*` vốn đã public.
2. **api-sso**: `toPublicAvatarUrl()` (`config/avatarUpload.ts`) chuẩn hoá về URL **tương đối theo
   origin** (`/api/api-sso/uploads/...` hoặc `/api/api-core/uploads/...`, encode từng segment) — không
   hard-code domain nên chạy đúng trên mọi môi trường. Dùng ở `authService.me()` +
   `accountService.getProfile()`.
3. **FE**: `avatarSrc()` / `resolveUploadUrl()` thành idempotent (path bắt đầu `/api/` hoặc `http` →
   giữ nguyên) để không ghép prefix 2 lần; vẫn xử lý path thô từ chỗ khác (vd `actor_avatar` trong
   notification, `a_AdminListUsers`).

## Icon ứng dụng: URL mới cho mỗi lần cập nhật (22/09/2026)

Icon upload là PNG 138 × 138 (3 lần kích thước hiển thị 46 px) để sắc nét trên màn hình mật độ cao. File giới hạn 1MB, có UUID trong tên; `a_app.icon` lưu URL mới. Sau khi DB ghi thành công, API dọn file cũ. Tên mới tránh trình duyệt dùng lại ảnh đã cache khi admin đóng modal. Static icon/avatar dùng `Cache-Control: max-age=31536000, immutable` vì file UUID không bị ghi đè. Avatar được client cắt về 400 × 400 và nén WebP trước khi upload; API avatar vẫn nhận các định dạng cũ cho client khác.

## Avatar lưu ở api-core, api-sso chỉ chuyển tiếp (25/09/2026)

**Bối cảnh:** api-sso tự lưu avatar (`/api-sso/uploads/avatars/...`) trong khi api-core (quản lý người
dùng) cũng lưu avatar (`uploads/...`). 2 nơi lưu, 2 dạng path → task/chat/meeting và các FE phải hiểu cả
hai, file nằm rải 2 server. **Chọn:** api-core là nơi duy nhất lưu file + ghi `user_profiles.avatar`
(`POST /internal/users/:userId/avatar`, cùng secret `CORE_INTERNAL_SECRET` đã có), path giữ nguyên format
`UploadService` của api-core — user chốt không đổi format/không sửa nhiều api-core. api-sso giữ endpoint
`POST /account/avatar` (auth + validate) rồi forward multipart. **Không chọn** cho sso-web upload thẳng
`/api/api-core/upload`: endpoint đó chung cho mọi file, không gắn user, không ghi DB, và sso-web phải gọi
thêm 1 bước lưu path → user có thể gán path bất kỳ. **Đánh đổi:** ảnh đi 2 chặng (≤5MB, chấp nhận được);
api-core down thì không đổi được avatar (báo 502 thay vì lưu tạm ở sso).
