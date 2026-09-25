import { config } from '../config/config';
import { AppError } from '../errors/AppError';

// Sau khi user tự sửa hồ sơ / đổi avatar ở sso-web (đã ghi build_management
// qua a_UpdateSelfProfile / a_SetAvatar), báo api-core đồng bộ xuống
// task_management + module chat + api-meeting. api-core là nơi DUY NHẤT giữ
// logic sync đó (split tên, tính isAdmin, hình dạng payload chat/meeting) +
// các secret downstream -
// api-sso chỉ cần 1 secret (CORE_INTERNAL_SECRET) để nói chuyện api-core.
//
// KHÔNG throw / KHÔNG chặn phản hồi sửa hồ sơ: lỗi mạng / api-core down /
// thiếu secret -> chỉ log.
export async function resyncProfile(userId: string): Promise<void> {
  if (!config.coreInternal.secret) return;
  try {
    const res = await fetch(`${config.coreInternal.baseUrl}/internal/users/profile-resync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': config.coreInternal.secret,
      },
      body: JSON.stringify({ user_id: userId }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(`[coreResync] profile-resync failed: HTTP ${res.status}`);
    }
  } catch (error) {
    console.warn('[coreResync] profile-resync error:', (error as Error).message);
  }
}

// Đổi avatar ở sso-web: api-sso KHÔNG lưu file (25/09/2026) - chuyển tiếp ảnh
// sang api-core, api-core lưu bằng UploadService chung (uploads/yyyy-mm-dd/), ghi
// user_profiles.avatar, dọn file cũ và tự đồng bộ task/chat/meeting. Khác
// resyncProfile: đây là thao tác chính nên lỗi phải báo lại cho user.
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
