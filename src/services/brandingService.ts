import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import { injectable } from 'tsyringe';

import { toPublicAvatarUrl } from '../config/avatarUpload';
import { AppError } from '../errors/AppError';
import {
  type BrandingImageKind,
  BrandingRepository,
  type BrandingText,
} from '../repositories/brandingRepository';

const BRANDING_ROOT = 'uploads/branding';
// Không nhận SVG: ảnh phục vụ cùng origin với sso-web, SVG chứa script mở trực
// tiếp là XSS. Favicon cho thêm .ico.
const IMAGE_EXT: Record<BrandingImageKind, string[]> = {
  logo_light: ['.png', '.jpg', '.jpeg', '.webp'],
  logo_dark: ['.png', '.jpg', '.jpeg', '.webp'],
  favicon: ['.png', '.ico'],
  login_background: ['.png', '.jpg', '.jpeg', '.webp'],
};
const MAX_BYTES: Record<BrandingImageKind, number> = {
  logo_light: 2 * 1024 * 1024,
  logo_dark: 2 * 1024 * 1024,
  favicon: 512 * 1024,
  login_background: 5 * 1024 * 1024,
};

// Thông tin thương hiệu SSO (26/09/2026): đọc công khai (trang đăng nhập cần),
// sửa chỉ admin. Cache trong bộ nhớ, xoá khi sửa (1 instance/triển khai; nhiều
// instance thì lệch tối đa CACHE_MS).
const CACHE_MS = 60_000;

@injectable()
export class BrandingService {
  private cache: { at: number; value: unknown } | null = null;

  constructor(private repo: BrandingRepository) {}

  async getPublic() {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const row = await this.repo.get();
    if (!row) throw new AppError(500, 'Chưa cấu hình thông tin tổ chức (a_org_setting).');
    const value = {
      ...row,
      logo_light: toPublicAvatarUrl(row.logo_light),
      logo_dark: toPublicAvatarUrl(row.logo_dark),
      favicon: toPublicAvatarUrl(row.favicon),
      login_background: toPublicAvatarUrl(row.login_background),
    };
    this.cache = { at: Date.now(), value };
    return value;
  }

  async updateText(input: BrandingText, actor: string): Promise<void> {
    await this.repo.updateText(input, actor);
    this.cache = null;
  }

  async setImage(kind: BrandingImageKind, file: Express.Multer.File | undefined, actor: string) {
    if (!file) throw new AppError(400, 'Chưa chọn ảnh.');
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXT[kind].includes(ext)) {
      throw new AppError(400, `Chỉ nhận ${IMAGE_EXT[kind].join(', ')}.`);
    }
    if (file.size > MAX_BYTES[kind]) {
      throw new AppError(400, `Ảnh tối đa ${Math.round(MAX_BYTES[kind] / 1024)}KB.`);
    }
    await fs.mkdir(BRANDING_ROOT, { recursive: true });
    // Tên file mới mỗi lần -> URL mới, trình duyệt không dùng ảnh cache cũ.
    const diskPath = path.join(BRANDING_ROOT, `${kind}-${randomUUID()}${ext}`);
    await fs.writeFile(diskPath, file.buffer);
    const value = '/api-sso/' + diskPath.split(path.sep).join('/');

    const previous = (await this.repo.get())?.[kind] ?? null;
    try {
      await this.repo.setImage(kind, value, actor);
    } catch (error) {
      await this.removeFile(value);
      throw error;
    }
    await this.removeFile(previous);
    this.cache = null;
    return toPublicAvatarUrl(value);
  }

  // Về ảnh mặc định của sso-web.
  async resetImage(kind: BrandingImageKind, actor: string): Promise<void> {
    const previous = (await this.repo.get())?.[kind] ?? null;
    await this.repo.setImage(kind, null, actor);
    await this.removeFile(previous);
    this.cache = null;
  }

  private async removeFile(dbPath: string | null): Promise<void> {
    if (!dbPath?.startsWith('/api-sso/uploads/branding/')) return;
    const root = path.resolve(BRANDING_ROOT);
    const target = path.resolve(dbPath.replace(/^\/api-sso\//, ''));
    if (!target.startsWith(root + path.sep)) return;
    await fs.unlink(target).catch(() => undefined);
  }
}
