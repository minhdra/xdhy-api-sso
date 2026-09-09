import { config } from '../config/config';

// Đồng bộ hồ sơ user (tự sửa ở sso-web) sang task_management qua endpoint nhẹ
// POST /internal/sync/users/profile của api-task-management (chỉ full_name/
// avatar/gender/date_of_birth/email/phone_number - không đụng branch/dept/
// position). Field NULL -> proc UpdateUserProfile giữ nguyên (COALESCE), nên
// gọi được cả avatar-only.
//
// KHÔNG throw / KHÔNG chặn phản hồi sửa hồ sơ: lỗi mạng / task down / thiếu
// secret -> chỉ log. Giống taskSyncClient bên api-core (fetch built-in).

export interface TaskProfileSyncPayload {
  user_id: string;
  full_name?: string | null;
  avatar?: string | null;
  gender?: number | null;
  date_of_birth?: string | null;
  email?: string | null;
  phone_number?: string | null;
  lu_user_id: string;
}

export async function syncProfileToTask(payload: TaskProfileSyncPayload): Promise<void> {
  if (!config.taskSync.secret) return;
  try {
    const res = await fetch(`${config.taskSync.baseUrl}/internal/sync/users/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': config.taskSync.secret,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(`[taskSync] POST users/profile failed: HTTP ${res.status}`);
    }
  } catch (error) {
    console.warn('[taskSync] POST users/profile error:', (error as Error).message);
  }
}
