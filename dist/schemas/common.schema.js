"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.birthDate = exports.optionalLandline = exports.personName = exports.LANDLINE = exports.MOBILE_PHONE = exports.PERSON_NAME = exports.optionalNumber = exports.optionalString = void 0;
const zod_1 = require("../openapi/zod");
// FE thường gửi `null` cho field text chưa nhập thay vì bỏ hẳn key. Chuẩn hoá
// cả null lẫn undefined về '' cho field string không bắt buộc (copy subset từ
// api-core/src/schemas/common.schema.ts).
const optionalString = (defaultValue = '') => zod_1.z.preprocess((val) => (val === null || val === undefined ? defaultValue : val), zod_1.z.string());
exports.optionalString = optionalString;
// Field số không bắt buộc dùng làm bộ lọc/flag: null khi rỗng (không phải 0).
const optionalNumber = () => zod_1.z.preprocess((val) => (val === null || val === undefined || val === '' ? null : val), zod_1.z.number().int().nullable());
exports.optionalNumber = optionalNumber;
// Quy tắc dùng chung - KHỚP sso-web/src/validator.ts (RULES_FORM).
exports.PERSON_NAME = /^[\p{L}]+( [\p{L}]+)*$/u;
exports.MOBILE_PHONE = /^0\d{9}$/;
exports.LANDLINE = /^[0-9+()\s.-]{6,20}$/;
const personName = () => zod_1.z.string().trim().min(2, 'Họ tên ít nhất 2 ký tự').max(60, 'Họ tên tối đa 60 ký tự')
    .regex(exports.PERSON_NAME, 'Họ tên chỉ gồm chữ cái, cách nhau 1 khoảng trắng');
exports.personName = personName;
// Rỗng/null -> '' (không nhập); có nhập thì phải đúng định dạng.
const optionalLandline = () => zod_1.z.preprocess((v) => (v === null || v === undefined ? '' : typeof v === 'string' ? v.trim() : v), zod_1.z.union([zod_1.z.literal(''), zod_1.z.string().regex(exports.LANDLINE, 'Chỉ gồm số và + ( ) . - (6–20 ký tự)')]));
exports.optionalLandline = optionalLandline;
const birthDate = () => zod_1.z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày sinh dạng YYYY-MM-DD')
    .refine((d) => d >= '1900-01-01' && d <= new Date().toISOString().slice(0, 10), 'Ngày sinh không hợp lệ')
    .nullable()
    .optional();
exports.birthDate = birthDate;
