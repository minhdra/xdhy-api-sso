import { z } from '../openapi/zod';

import { optionalString } from './common.schema';

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{3,8}$/, 'Màu phải ở dạng mã hex, vd #2563a6')
  .optional();

export const upsertAppSchema = z
  .object({
    app_id: z.string().nullable().optional(),
    app_key: z
      .string()
      .min(1, 'Mã ứng dụng là bắt buộc')
      .regex(/^[a-z0-9-]+$/, 'Mã ứng dụng chỉ gồm chữ thường, số và dấu gạch ngang'),
    app_name: z.string().min(1, 'Tên ứng dụng là bắt buộc'),
    description: optionalString(),
    url: optionalString(),
    color: hexColor,
    sort_order: z.number().int().optional(),
  })
  .openapi('UpsertAppRequest');
export type UpsertAppInput = z.infer<typeof upsertAppSchema>;

export const deleteAppSchema = z
  .object({
    app_id: z.string().min(1, 'Thiếu app_id'),
  })
  .openapi('DeleteAppRequest');
export type DeleteAppInput = z.infer<typeof deleteAppSchema>;

export const appIdParamSchema = z
  .object({
    app_id: z.string().min(1, 'Thiếu app_id'),
  })
  .openapi('AppIdParam');
export type AppIdParam = z.infer<typeof appIdParamSchema>;

export const setAppAccessSchema = z
  .object({
    user_ids: z.array(z.string().min(1)).default([]),
  })
  .openapi('SetAppAccessRequest');
export type SetAppAccessInput = z.infer<typeof setAppAccessSchema>;

export const appAccessCandidatesQuerySchema = z
  .object({
    q: z.string().trim().max(150).optional().default(''),
    position_id: z.preprocess(
      (value) => (value === '' || value === undefined ? undefined : value),
      z.coerce.number().int().positive().optional(),
    ),
    page: z.coerce.number().int().min(1).optional().default(1),
    page_size: z.coerce.number().int().min(1).max(100).optional().default(20),
  })
  .openapi('AppAccessCandidatesQuery');
export type AppAccessCandidatesQuery = z.infer<typeof appAccessCandidatesQuerySchema>;

export const mutateAppAccessSchema = z
  .object({
    user_ids: z.array(z.string().min(1)).min(1, 'Chọn ít nhất một người dùng').max(500),
  })
  .openapi('MutateAppAccessRequest');
export type MutateAppAccessInput = z.infer<typeof mutateAppAccessSchema>;
