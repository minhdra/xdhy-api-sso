import { injectable } from 'tsyringe';

import { AppError } from '../errors/AppError';
import { AppRepository, type SsoApp, type SsoAppAdmin, type SsoAppUser } from '../repositories/appRepository';

export interface UpsertAppInput {
  app_id?: string | null;
  app_key: string;
  app_name: string;
  description?: string;
  url?: string;
  color?: string;
  sort_order?: number;
}

// Lỗi nghiệp vụ (app_key trùng, không tìm thấy app...) được proc trả qua
// p_error_code/-1 -> Database.query() throw Error(p_error_message). Bắt lại
// ở đây và quy về AppError(400) thay vì để rơi xuống 500 mặc định.
function toAppError(error: unknown): AppError {
  if (error instanceof Error) return new AppError(400, error.message);
  return new AppError(500, 'Lỗi không xác định.');
}

@injectable()
export class AppService {
  constructor(private appRepository: AppRepository) {}

  isAdmin(userId: string): Promise<boolean> {
    return this.appRepository.isAdmin(userId);
  }

  listForUser(userId: string): Promise<SsoApp[]> {
    return this.appRepository.listForUser(userId);
  }

  adminList(): Promise<SsoAppAdmin[]> {
    return this.appRepository.adminList();
  }

  async upsertApp(input: UpsertAppInput, actorUserId: string): Promise<{ app_id: string }> {
    try {
      return await this.appRepository.adminUpsert({
        app_id: input.app_id ?? null,
        app_key: input.app_key,
        app_name: input.app_name,
        description: input.description ?? '',
        url: input.url ?? '',
        color: input.color ?? '#2563a6',
        sort_order: input.sort_order ?? 0,
        lu_user_id: actorUserId,
      });
    } catch (error) {
      throw toAppError(error);
    }
  }

  async deleteApp(appId: string, actorUserId: string): Promise<void> {
    try {
      await this.appRepository.adminDelete(appId, actorUserId);
    } catch (error) {
      throw toAppError(error);
    }
  }

  listAppAccess(appId: string): Promise<SsoAppUser[]> {
    return this.appRepository.adminListAccess(appId);
  }

  async setAppAccess(appId: string, userIds: string[], actorUserId: string): Promise<void> {
    try {
      await this.appRepository.adminSetAccess(appId, userIds, actorUserId);
    } catch (error) {
      throw toAppError(error);
    }
  }

  listUsers(): Promise<SsoAppUser[]> {
    return this.appRepository.adminListUsers();
  }
}
