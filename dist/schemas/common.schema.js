"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalNumber = exports.optionalString = void 0;
const zod_1 = require("../openapi/zod");
// FE thường gửi `null` cho field text chưa nhập thay vì bỏ hẳn key. Chuẩn hoá
// cả null lẫn undefined về '' cho field string không bắt buộc (copy subset từ
// api-core/src/schemas/common.schema.ts).
const optionalString = (defaultValue = '') => zod_1.z.preprocess((val) => (val === null || val === undefined ? defaultValue : val), zod_1.z.string());
exports.optionalString = optionalString;
// Field số không bắt buộc dùng làm bộ lọc/flag: null khi rỗng (không phải 0).
const optionalNumber = () => zod_1.z.preprocess((val) => (val === null || val === undefined || val === '' ? null : val), zod_1.z.number().int().nullable());
exports.optionalNumber = optionalNumber;
