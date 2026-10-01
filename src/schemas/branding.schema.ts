import { z } from '../openapi/zod';

import { BRANDING_IMAGE_KINDS } from '../repositories/brandingRepository';

const nullableText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(max).nullable().optional().default(null),
  );

export const updateBrandingSchema = z
  .object({
    org_name: z.string().trim().min(1, 'Tên tổ chức là bắt buộc').max(150),
    short_name: z.string().trim().min(1, 'Tên viết tắt là bắt buộc').max(50),
    app_name: z.string().trim().min(1, 'Tên ứng dụng là bắt buộc').max(100),
    tagline: nullableText(250),
    login_heading: nullableText(150),
    login_description: nullableText(500),
    primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Màu dạng #RRGGBB'),
    footer_text: nullableText(250),
    footer_links: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(50),
          // Chỉ http(s) hoặc đường dẫn nội bộ - chặn javascript: trong href.
          url: z
            .string()
            .trim()
            .max(500)
            .regex(/^(https?:\/\/|\/)/, 'Link bắt đầu bằng http(s):// hoặc /'),
        }),
      )
      .max(8)
      .default([]),
  })
  .openapi('UpdateBrandingRequest');
export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;

export const brandingKindParamSchema = z.object({ kind: z.enum(BRANDING_IMAGE_KINDS) });
