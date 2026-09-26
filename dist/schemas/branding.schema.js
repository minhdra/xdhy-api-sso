"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.brandingKindParamSchema = exports.updateBrandingSchema = void 0;
const zod_1 = require("../openapi/zod");
const brandingRepository_1 = require("../repositories/brandingRepository");
const nullableText = (max) => zod_1.z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), zod_1.z.string().trim().max(max).nullable().optional().default(null));
exports.updateBrandingSchema = zod_1.z
    .object({
    org_name: zod_1.z.string().trim().min(1, 'Tên tổ chức là bắt buộc').max(150),
    short_name: zod_1.z.string().trim().min(1, 'Tên viết tắt là bắt buộc').max(50),
    app_name: zod_1.z.string().trim().min(1, 'Tên ứng dụng là bắt buộc').max(100),
    tagline: nullableText(250),
    login_heading: nullableText(150),
    login_description: nullableText(500),
    primary_color: zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Màu dạng #RRGGBB'),
    footer_text: nullableText(250),
    footer_links: zod_1.z
        .array(zod_1.z.object({
        label: zod_1.z.string().trim().min(1).max(50),
        // Chỉ http(s) hoặc đường dẫn nội bộ - chặn javascript: trong href.
        url: zod_1.z
            .string()
            .trim()
            .max(500)
            .regex(/^(https?:\/\/|\/)/, 'Link bắt đầu bằng http(s):// hoặc /'),
    }))
        .max(8)
        .default([]),
})
    .openapi('UpdateBrandingRequest');
exports.brandingKindParamSchema = zod_1.z.object({ kind: zod_1.z.enum(brandingRepository_1.BRANDING_IMAGE_KINDS) });
