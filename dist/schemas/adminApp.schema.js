"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mutateAppAccessSchema = exports.appAccessCandidatesQuerySchema = exports.setAppAccessSchema = exports.appIdParamSchema = exports.deleteAppSchema = exports.upsertAppSchema = void 0;
const zod_1 = require("../openapi/zod");
const common_schema_1 = require("./common.schema");
const hexColor = zod_1.z
    .string()
    .regex(/^#[0-9a-fA-F]{3,8}$/, 'Màu phải ở dạng mã hex, vd #2563a6')
    .optional();
exports.upsertAppSchema = zod_1.z
    .object({
    app_id: zod_1.z.string().nullable().optional(),
    app_key: zod_1.z
        .string()
        .min(1, 'Mã ứng dụng là bắt buộc')
        .regex(/^[a-z0-9-]+$/, 'Mã ứng dụng chỉ gồm chữ thường, số và dấu gạch ngang'),
    app_name: zod_1.z.string().min(1, 'Tên ứng dụng là bắt buộc'),
    description: (0, common_schema_1.optionalString)(),
    url: (0, common_schema_1.optionalString)(),
    color: hexColor,
    sort_order: zod_1.z.number().int().optional(),
})
    .openapi('UpsertAppRequest');
exports.deleteAppSchema = zod_1.z
    .object({
    app_id: zod_1.z.string().min(1, 'Thiếu app_id'),
})
    .openapi('DeleteAppRequest');
exports.appIdParamSchema = zod_1.z
    .object({
    app_id: zod_1.z.string().min(1, 'Thiếu app_id'),
})
    .openapi('AppIdParam');
exports.setAppAccessSchema = zod_1.z
    .object({
    user_ids: zod_1.z.array(zod_1.z.string().min(1)).default([]),
})
    .openapi('SetAppAccessRequest');
exports.appAccessCandidatesQuerySchema = zod_1.z
    .object({
    q: zod_1.z.string().trim().max(150).optional().default(''),
    position_id: zod_1.z.preprocess((value) => (value === '' || value === undefined ? undefined : value), zod_1.z.coerce.number().int().positive().optional()),
    page: zod_1.z.coerce.number().int().min(1).optional().default(1),
    page_size: zod_1.z.coerce.number().int().min(1).max(100).optional().default(20),
})
    .openapi('AppAccessCandidatesQuery');
exports.mutateAppAccessSchema = zod_1.z
    .object({
    user_ids: zod_1.z.array(zod_1.z.string().min(1)).min(1, 'Chọn ít nhất một người dùng').max(500),
})
    .openapi('MutateAppAccessRequest');
