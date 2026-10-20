"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRevokeUserSessionsSchema = exports.adminSessionsQuerySchema = void 0;
const zod_1 = require("../openapi/zod");
exports.adminSessionsQuerySchema = zod_1.z
    .object({
    q: zod_1.z.string().trim().max(100).optional().default(''),
    page: zod_1.z.coerce.number().int().min(1).optional().default(1),
    page_size: zod_1.z.coerce.number().int().min(1).max(100).optional().default(20),
})
    .openapi('AdminSessionsQuery');
exports.adminRevokeUserSessionsSchema = zod_1.z
    .object({
    user_id: zod_1.z.string().min(1, 'Thiếu user_id'),
})
    .openapi('AdminRevokeUserSessionsRequest');
