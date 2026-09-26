import { config } from '../config/config';
import { AppError } from '../errors/AppError';

// Đổi avatar ở sso-web: api-sso KHÔNG lưu file (25/09/2026) - chuyển tiếp ảnh
// sang api-core, api-core lưu bằng UploadService chung (uploads/yyyy-mm-dd/) và
// dọn file cũ. Ghi DB + đồng bộ app do api-sso làm (AccountService.setAvatar).
// Thao tác chính nên lỗi phải báo lại cho user.
// Trả path thô api-core đã lưu (format UploadService).
export async function uploadAvatar(userId: string, file: Express.Multer.File): Promise<string> {
  if (!config.coreInternal.secret) {
    throw new AppError(503, 'Chưa cấu hình kết nối api-core, không thể đổi ảnh đại diện.');
  }

  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
    file.originalname,
  );

  let res: Response;
  try {
    res = await fetch(
      `${config.coreInternal.baseUrl}/internal/users/${encodeURIComponent(userId)}/avatar`,
      {
        method: 'POST',
        headers: { 'X-Internal-Secret': config.coreInternal.secret },
        body: form,
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch (error) {
    console.warn('[coreAvatar] upload error:', (error as Error).message);
    throw new AppError(502, 'Không kết nối được máy chủ lưu ảnh, vui lòng thử lại.');
  }

  const data = (await res.json().catch(() => ({}))) as { avatar?: string; message?: string };
  if (!res.ok || !data.avatar) {
    console.warn(`[coreAvatar] upload failed: HTTP ${res.status} ${data.message ?? ''}`);
    // 400 (file không hợp lệ) / 404 (không có hồ sơ) báo nguyên văn; còn lại generic.
    if (res.status === 400 || res.status === 404) {
      throw new AppError(res.status, data.message || 'Ảnh không hợp lệ.');
    }
    throw new AppError(502, 'Không lưu được ảnh đại diện, vui lòng thử lại.');
  }
  return data.avatar;
}
