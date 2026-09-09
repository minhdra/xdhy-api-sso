import { config } from '../config/config';

// Đồng bộ hồ sơ user (tự sửa ở sso-web) sang module chat. Chat: API update =
// API insert (upsert theo user_id) -> POST /internal/sync/users. Payload cùng
// shape với api-core (creatUser) để nhất quán.
//
// KHÔNG throw / KHÔNG chặn phản hồi: lỗi mạng / chat chưa deploy / thiếu
// secret -> chỉ log.

export interface ChatUserSyncPayload {
  user_id: string;
  user_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_number: string;
  avatar: string | null;
  role: 'admin' | 'user';
  active_flag: 0 | 1;
  created_by_user_id: string;
}

export async function upsertUserToChat(payload: ChatUserSyncPayload): Promise<void> {
  if (!config.chatSync.secret) return;
  try {
    const res = await fetch(`${config.chatSync.baseUrl}/internal/sync/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': config.chatSync.secret,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(`[chatSync] POST users failed: HTTP ${res.status}`);
    }
  } catch (error) {
    console.warn('[chatSync] POST users error:', (error as Error).message);
  }
}
