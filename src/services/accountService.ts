import { injectable } from 'tsyringe';

import { toPublicAvatarUrl } from '../config/avatarUpload';
import { AppError } from '../errors/AppError';
import { resyncProfile, uploadAvatar } from '../integrations/coreClient';
import { SessionRepository } from '../repositories/sessionRepository';
import { UserRepository } from '../repositories/userRepository';
import { hashPassword, verifyPassword } from '../utilities/password';

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
  ) {}

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
  // Sau khi ghi build_management -> báo api-core đồng bộ xuống task + chat
  // (non-blocking, xem integrations/coreClient.ts).
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
    void resyncProfile(userId);
  }

  // api-core lưu file + ghi DB + đồng bộ downstream (xem coreClient.uploadAvatar).
  // Trả về URL public của avatar mới để FE cập nhật ngay.
  async setAvatar(userId: string, file: Express.Multer.File): Promise<string | null> {
    return toPublicAvatarUrl(await uploadAvatar(userId, file));
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
