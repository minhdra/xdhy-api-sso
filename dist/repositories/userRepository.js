"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRepository = void 0;
const tsyringe_1 = require("tsyringe");
const database_1 = require("../config/database");
const password_1 = require("../utilities/password");
// Copy nguyên văn phần liên quan auth từ api-core/src/repositories/userRepository.ts
// - đã bỏ các method quản trị user (create/update/delete/search/lock/reset-password)
// vì ngoài phạm vi service này (auth + account self-service).
let UserRepository = class UserRepository {
    constructor(db) {
        this.db = db;
    }
    // Cho phép đăng nhập bằng username/email/số điện thoại - stored procedure
    // "GetUserByAccount" chỉ match user_name (đã đọc definition thật, không
    // đoán), KHÔNG sửa procedure đó (rủi ro, dùng chung với api-core cũ) - tra
    // trước bằng SELECT thuần (chỉ đọc system_users/user_profiles, không đụng
    // logic nghiệp vụ) để quy mọi kiểu định danh về đúng user_name, rồi mới đi
    // tiếp luồng cũ (getByUsername -> GetUserByAccount) không đổi gì khác.
    async resolveUsername(identifier) {
        const rows = await this.db.raw(`SELECT s.user_name
       FROM system_users s
       JOIN user_profiles u ON u.user_id = s.user_id
       WHERE s.active_flag = 1 AND u.active_flag = 1
         AND (s.user_name = $1 OR u.email = $1 OR u.phone_number = $1)
       LIMIT 1`, [identifier]);
        return rows[0]?.user_name ?? null;
    }
    // "Quên mật khẩu" chỉ nhận email - tra user_id + user_name (2 cái sau cần
    // để gọi lại đúng stored procedure "ResetPassword" ở bước xác nhận, xem
    // AuthService.resetPasswordConfirm). Không lộ ra ngoài việc email này có
    // tồn tại hay không (controller luôn trả 1 message chung).
    async findByEmail(email) {
        const rows = await this.db.raw(`SELECT s.user_id, s.user_name
       FROM system_users s
       JOIN user_profiles u ON u.user_id = s.user_id
       WHERE s.active_flag = 1 AND u.active_flag = 1 AND u.email = $1
       LIMIT 1`, [email]);
        return rows[0] ?? null;
    }
    async getUsernameEmailById(userId) {
        const rows = await this.db.raw(`SELECT s.user_name, u.email
       FROM system_users s
       JOIN user_profiles u ON u.user_id = s.user_id
       WHERE s.active_flag = 1 AND u.active_flag = 1 AND s.user_id = $1
       LIMIT 1`, [userId]);
        return rows[0] ?? null;
    }
    async getByUsername(username) {
        const sql = `
      CALL "GetUserByAccount"(
        $1,
        NULL,
        NULL,
        NULL
      )
    `;
        const pResult = await this.db.queryObject(sql, [username]);
        if (!pResult) {
            return null;
        }
        if (Array.isArray(pResult.user) && pResult.user.length > 0) {
            const user = pResult.user[0];
            user.employees = pResult.employees;
            return user;
        }
        return null;
    }
    async authenticate(username, password) {
        const user = await this.getByUsername(username);
        if (user && (await (0, password_1.verifyPassword)(password, user.password))) {
            return user;
        }
        return null;
    }
    // "ResetPassword" set p_error_code = -1 khi user_name/email không khớp
    // (đã đọc definition thật) - Database.query() thấy error_code != 0 sẽ
    // THROW, không trả null. Phải bắt riêng ở đây để phân biệt "không khớp"
    // (trả false, coi là bình thường - user gõ sai) với lỗi hạ tầng thật (throw
    // tiếp cho errorHandler xử lý) - không để lộ 500 kèm message DB thật ra
    // response.
    async resetPassword(user_name, email, new_password) {
        const sql = `
      CALL "ResetPassword"(
        $1,
        $2,
        $3,
        NULL,
        NULL,
        NULL
      )
    `;
        try {
            await this.db.query(sql, [user_name, email, new_password]);
            return true;
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('không đúng')) {
                return false;
            }
            throw error;
        }
    }
    // Hash mật khẩu hiện tại - verify mật khẩu cũ bằng bcrypt ở tầng app
    // (bcrypt.compare không làm trong SQL được). Proc "a_GetUserPasswordHash".
    async getPasswordHash(user_id) {
        const row = await this.db.query(`CALL "a_GetUserPasswordHash"($1, NULL, NULL, NULL)`, [user_id]);
        return row?.password ?? null;
    }
    // Ghi mật khẩu mới (đã hash bcrypt sẵn ở tầng app). Proc "a_SetUserPassword"
    // dùng cho cả đổi mật khẩu từ trang tài khoản lẫn nâng cấp hash MD5->bcrypt
    // lúc đăng nhập.
    async setPassword(user_id, new_password_hash, lu_user_id) {
        await this.db.query(`CALL "a_SetUserPassword"($1, $2, $3, NULL, NULL, NULL)`, [user_id, new_password_hash, lu_user_id]);
    }
    // Hồ sơ đầy đủ cho trang "Quản lý tài khoản" - gồm cả tên phòng ban / chức
    // vụ / chi nhánh (chỉ hiển thị, user không tự sửa). Proc "a_GetAccountProfile".
    async getAccountProfile(user_id) {
        return this.db.query(`CALL "a_GetAccountProfile"($1, NULL, NULL, NULL)`, [user_id]);
    }
    // Cập nhật các field hồ sơ tự phục vụ (chỉ những field user được sửa). Proc
    // "a_UpdateSelfProfile" - KHÔNG dùng "UpdateUser" của api-core (proc đó set
    // cả branch/department/position/type nên phải nạp lại hết rồi merge, dễ vỡ).
    async updateSelfProfile(user) {
        await this.db.query(`CALL "a_UpdateSelfProfile"($1, $2, $3, $4, $5, $6, $7, NULL, NULL, NULL)`, [
            user.user_id,
            user.full_name,
            user.email,
            user.phone_number,
            user.gender,
            user.date_of_birth,
            user.lu_user_id,
        ]);
    }
    async getUserById(id) {
        const sql = `
      CALL "GetUserById"(
        $1,
        NULL,
        NULL,
        NULL
      )
    `;
        const result = await this.db.query(sql, [id]);
        if (!result) {
            return null;
        }
        return result;
    }
    async getFunctionByUserId(id) {
        const sql = `
      CALL "GetFunctionByUserId"(
        $1,
        NULL,
        NULL,
        NULL
      )
    `;
        const result = await this.db.queryList(sql, [id]);
        return result.rows;
    }
    async getActionByUserId(id) {
        const sql = `
      CALL "GetActionByUserId"(
        $1,
        NULL,
        NULL,
        NULL
      )
    `;
        const result = await this.db.queryList(sql, [id]);
        return result.rows;
    }
};
exports.UserRepository = UserRepository;
exports.UserRepository = UserRepository = __decorate([
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [database_1.Database])
], UserRepository);
