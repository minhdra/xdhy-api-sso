"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterAppAccessSchema = void 0;
const zod_1 = require("../openapi/zod");
// Route nội bộ (server-to-server) - KHÔNG lên Swagger công khai, không dùng
// defineRoute()/registry. Chỉ validate body qua middlewares/validate.
exports.filterAppAccessSchema = zod_1.z.object({
    app_key: zod_1.z
        .string()
        .min(1, 'app_key là bắt buộc')
        .regex(/^[a-z0-9-]+$/, 'app_key chỉ gồm chữ thường, số và dấu gạch ngang'),
    // Danh sách rỗng hợp lệ - trả về allowed_user_ids rỗng.
    user_ids: zod_1.z.array(zod_1.z.string().min(1)).default([]),
});
