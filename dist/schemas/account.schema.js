"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.revokeSessionSchema = exports.changePasswordSchema = exports.updateProfileSchema = void 0;
const zod_1 = require("../openapi/zod");
const common_schema_1 = require("./common.schema");
// Chỉ các field user tự sửa được. Các field quản trị (branch/department/
// position/type/first_middle_last_name) do accountService tự nạp lại từ DB
// rồi merge - client không gửi (xem plan §1c/§1d).
exports.updateProfileSchema = zod_1.z
    .object({
    full_name: zod_1.z.string().min(1, 'Họ tên là bắt buộc'),
    email: zod_1.z.string().email('Email không hợp lệ'),
    phone_number: (0, common_schema_1.optionalString)(),
    // 0 = chưa xác định, 1 = nam, 2 = nữ (theo dữ liệu build_management).
    gender: (0, common_schema_1.optionalNumber)(),
    // ISO date ('1990-01-31') hoặc rỗng. Postgres tự cast sang date.
    date_of_birth: zod_1.z.preprocess((v) => (v === null || v === undefined || v === '' ? null : v), zod_1.z.string().nullable()),
})
    .openapi('UpdateProfileRequest');
exports.changePasswordSchema = zod_1.z
    .object({
    oldPassword: zod_1.z.string().min(1, 'Nhập mật khẩu hiện tại'),
    newPassword: zod_1.z.string().min(6, 'Mật khẩu mới phải có ít nhất 6 ký tự'),
})
    .openapi('ChangePasswordRequest');
exports.revokeSessionSchema = zod_1.z
    .object({
    session_id: zod_1.z.string().min(1, 'Thiếu session_id'),
})
    .openapi('RevokeSessionRequest');
