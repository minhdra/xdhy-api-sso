import { injectable } from 'tsyringe';

import { toPublicAvatarUrl } from '../config/avatarUpload';
import { AppError } from '../errors/AppError';
import { upsertUserToChat } from '../integrations/chatSyncClient';
import { syncProfileToTask } from '../integrations/taskSyncClient';
import { AppRepository } from '../repositories/appRepository';
import { SessionRepository } from '../repositories/sessionRepository';
import { UserRepository } from '../repositories/userRepository';
import { hashPassword, verifyPassword } from '../utilities/password';
import { splitFullName } from '../utilities/splitFullName';

export interface UpdateProfilePatch {
  full_name: string;
  email: string;
  phone_number: string;
  gender: number | null;
  date_of_birth: string | null;
}

@injectable()
export class AccountService {
  constructor(
    private userRepository: UserRepository,
    private sessionRepository: SessionRepository,
    private appRepository: AppRepository,
  ) {}

  // Sau khi user tự sửa hồ sơ/avatar ở sso-web (ghi vào build_management),
  // đẩy sang task_management (bản sao user_profiles) + module chat. Không
  // await/không throw - lỗi sync không được chặn phản hồi sửa hồ sơ.
  private async fanOutProfile(userId: string): Promise<void> {
    try {
      await this.fanOutProfileInner(userId);
    } catch (error) {
      console.warn('[profileSync] chuẩn bị payload thất bại:', (error as Error).message);
    }
  }

  private async fanOutProfileInner(userId: string): Promise<void> {
    const p = await this.userRepository.getAccountProfile(userId);
    if (!p) return;
    // avatar: giữ nguyên giá trị THÔ trong DB (task-web/chat tự dựng URL,
    // giống dữ liệu api-core đẩy sang).
    void syncProfileToTask({
      user_id: userId,
      full_name: p.full_name ?? null,
      avatar: p.avatar ?? null,
      gender: p.gender ?? null,
      date_of_birth: p.date_of_birth ?? null,
      email: p.email ?? null,
      phone_number: p.phone_number ?? null,
      lu_user_id: userId,
    });
    const { first_name, middle_name, last_name } = splitFullName(p.full_name);
    const isAdmin = await this.appRepository.isAdmin(userId);
    void upsertUserToChat({
      user_id: userId,
      user_name: p.user_name ?? null,
      first_name: first_name || last_name || p.user_name || null,
      middle_name: middle_name || null,
      last_name: last_name || p.user_name || null,
      email: p.email ?? null,
      phone_number: p.phone_number ?? '',
      avatar: p.avatar ?? null,
      role: isAdmin ? 'admin' : 'user',
      active_flag: 1,
      created_by_user_id: userId,
    });
  }

  // Hồ sơ đầy đủ cho trang Quản lý tài khoản (gồm phòng ban/chức vụ/chi nhánh
  // để hiển thị, dù user không sửa được các field đó).
  async getProfile(userId: string) {
    const profile = await this.userRepository.getAccountProfile(userId);
    if (!profile) return profile;
    // avatar: path thô trong DB -> URL trình duyệt tải được (xem toPublicAvatarUrl).
    return { ...profile, avatar: toPublicAvatarUrl(profile.avatar) };
  }

  // Chỉ đụng vào các field hồ sơ tự phục vụ - proc a_UpdateSelfProfile không
  // chạm branch/department/position/type. Avatar có endpoint upload riêng.
  async updateProfile(userId: string, patch: UpdateProfilePatch): Promise<void> {
    await this.userRepository.updateSelfProfile({
      user_id: userId,
      full_name: patch.full_name,
      email: patch.email,
      phone_number: patch.phone_number,
      gender: patch.gender,
      date_of_birth: patch.date_of_birth,
      lu_user_id: userId,
    });
    void this.fanOutProfile(userId);
  }

  // Trả về URL avatar mới để FE cập nhật ngay.
  async setAvatar(userId: string, avatarUrl: string): Promise<string> {
    await this.userRepository.setAvatar(userId, avatarUrl, userId);
    void this.fanOutProfile(userId);
    return avatarUrl;
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const currentHash = await this.userRepository.getPasswordHash(userId);
    if (!currentHash) throw new AppError(404, 'Không tìm thấy tài khoản.');

    const ok = await verifyPassword(oldPassword, currentHash);
    if (!ok) throw new AppError(400, 'Mật khẩu hiện tại không đúng.');

    const newHash = await hashPassword(newPassword);
    await this.userRepository.setPassword(userId, newHash, userId);
  }

  async listSessions(userId: string, currentSessionId: string | null) {
    const rows = await this.sessionRepository.listByUser(userId);
    return rows.map((s) => ({ ...s, current: s.session_id === currentSessionId }));
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    currentSessionId: string | null,
  ): Promise<void> {
    if (sessionId === currentSessionId) {
      throw new AppError(400, 'Không thể thu hồi phiên hiện tại - dùng Đăng xuất.');
    }
    const affected = await this.sessionRepository.revokeSessionForUser(sessionId, userId);
    if (affected === 0) {
      throw new AppError(404, 'Phiên không tồn tại hoặc đã bị thu hồi.');
    }
  }
}
