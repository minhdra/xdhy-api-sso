import { injectable } from 'tsyringe';

import { removeAvatarFile, saveAvatarFile, toPublicAvatarUrl } from '../config/avatarUpload';
import { AppError } from '../errors/AppError';
import { OrgRepository } from '../repositories/orgRepository';
import { UserRepository } from '../repositories/userRepository';

import { SyncService } from './syncService';

// Đổi avatar (user tự đổi ở trang tài khoản hoặc admin đổi hộ ở màn Người
// dùng) - 26/09/2026 lưu file ở api-sso (format thư mục SSO, xem
// config/avatarUpload.ts), ghi sso_management, dọn file cũ, đồng bộ user sang
// các app. Trước đó (25-26/09) chuyển tiếp file sang api-core.
@injectable()
export class AvatarService {
  constructor(
    private orgRepository: OrgRepository,
    private userRepository: UserRepository,
    private sync: SyncService,
  ) {}

  async replace(userId: string, file: Express.Multer.File | undefined, actorId: string): Promise<string | null> {
    if (!file) throw new AppError(400, 'Chưa chọn ảnh.');
    const user = await this.orgRepository.getUserDetail(userId);
    if (!user) throw new AppError(404, 'Không tìm thấy người dùng.');

    const avatar = await saveAvatarFile({ user_id: user.user_id, user_name: user.user_name }, file);
    try {
      await this.userRepository.setAvatar(userId, avatar, actorId);
    } catch (error) {
      await removeAvatarFile(avatar);
      throw error;
    }
    if (user.avatar !== avatar) await removeAvatarFile(user.avatar);
    await this.sync.notify([{ entity: 'user', op: 'upsert', entity_id: userId }], actorId);
    return toPublicAvatarUrl(avatar);
  }
}
