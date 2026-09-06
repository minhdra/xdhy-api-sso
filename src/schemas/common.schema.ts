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
