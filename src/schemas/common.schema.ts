import { z } from '../openapi/zod';

// FE thường gửi `null` cho field text chưa nhập thay vì bỏ hẳn key. Chuẩn hoá
// cả null lẫn undefined về '' cho field string không bắt buộc (copy subset từ
// api-core/src/schemas/common.schema.ts).
export const optionalString = (defaultValue = '') =>
  z.preprocess((val) => (val === null || val === undefined ? defaultValue : val), z.string());

// Field số không bắt buộc dùng làm bộ lọc/flag: null khi rỗng (không phải 0).
export const optionalNumber = () =>
  z.preprocess(
    (val) => (val === null || val === undefined || val === '' ? null : val),
    z.number().int().nullable(),
  );

// Quy tắc dùng chung - KHỚP sso-web/src/validator.ts (RULES_FORM).
export const PERSON_NAME = /^[\p{L}]+( [\p{L}]+)*$/u;
export const MOBILE_PHONE = /^0\d{9}$/;
export const LANDLINE = /^[0-9+()\s.-]{6,20}$/;
export const personName = () =>
  z.string().trim().min(2, 'Họ tên ít nhất 2 ký tự').max(60, 'Họ tên tối đa 60 ký tự')
    .regex(PERSON_NAME, 'Họ tên chỉ gồm chữ cái, cách nhau 1 khoảng trắng');
// Rỗng/null -> '' (không nhập); có nhập thì phải đúng định dạng.
export const optionalLandline = () =>
  z.preprocess(
    (v) => (v === null || v === undefined ? '' : typeof v === 'string' ? v.trim() : v),
    z.union([z.literal(''), z.string().regex(LANDLINE, 'Chỉ gồm số và + ( ) . - (6–20 ký tự)')]),
  );
export const birthDate = () =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày sinh dạng YYYY-MM-DD')
    .refine((d) => d >= '1900-01-01' && d <= new Date().toISOString().slice(0, 10), 'Ngày sinh không hợp lệ')
    .nullable()
    .optional();
