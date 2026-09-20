import fs from 'node:fs/promises';
import path from 'node:path';

import { injectable } from 'tsyringe';

import { config } from '../config/config';
import {
  CleanupRepository,
  type SsoCleanupCounts,
} from '../repositories/cleanupRepository';

@injectable()
export class CleanupService {
  constructor(private cleanupRepository: CleanupRepository) {}

  async run(): Promise<{ acquired: boolean; counts: SsoCleanupCounts }> {
    const batchSize = config.cleanup.batchSize ?? 500;
    const maxBatches = config.cleanup.maxBatches ?? 20;
    const totals: SsoCleanupCounts = {
      password_reset_tokens: 0,
      refresh_tokens: 0,
      sessions: 0,
      avatar_files: 0,
    };

    for (let batch = 0; batch < maxBatches; batch += 1) {
      const result = await this.cleanupRepository.cleanupBatch({
        sessionRetentionDays: config.cleanup.sessionRetentionDays ?? 30,
        passwordResetRetentionDays: config.cleanup.passwordResetRetentionDays ?? 7,
        batchSize,
        dryRun: config.cleanup.dryRun,
      });
      if (!result.acquired) return { acquired: false, counts: totals };

      totals.password_reset_tokens += result.counts.password_reset_tokens;
      totals.refresh_tokens += result.counts.refresh_tokens;
      totals.sessions += result.counts.sessions;

      const batchTotal = Object.values(result.counts).reduce((sum, count) => sum + count, 0);
      // Session có refresh token vừa bị xóa trong cùng data-modifying CTE chỉ
      // trở thành ứng viên ở statement kế tiếp (các CTE dùng chung snapshot).
      // Vì vậy chạy thêm một batch khi vừa xóa refresh token, dù tổng chưa đầy.
      if (
        config.cleanup.dryRun ||
        (batchTotal < batchSize && result.counts.refresh_tokens === 0)
      ) {
        break;
      }
    }

    totals.avatar_files = await this.cleanupOrphanAvatars();
    return { acquired: true, counts: totals };
  }

  private async cleanupOrphanAvatars(): Promise<number> {
    const avatarRoot = path.resolve(process.cwd(), 'uploads/avatars');
    const cutoffMs =
      Date.now() - (config.cleanup.orphanAvatarGraceHours ?? 24) * 60 * 60 * 1000;
    const maxFiles = config.cleanup.orphanAvatarMaxFilesPerRun ?? 1000;
    let scannedFiles = 0;
    let orphanFiles = 0;

    const walk = async (directory: string): Promise<void> => {
      if (scannedFiles >= maxFiles) return;
      let entries: import('node:fs').Dirent[];
      try {
        entries = await fs.readdir(directory, { withFileTypes: true });
      } catch (error: any) {
        if (error?.code === 'ENOENT') return;
        throw error;
      }

      for (const entry of entries) {
        if (scannedFiles >= maxFiles) break;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await walk(absolutePath);
          continue;
        }
        if (!entry.isFile()) continue;

        scannedFiles += 1;
        const stat = await fs.stat(absolutePath);
        if (stat.mtimeMs >= cutoffMs) continue;

        const relativePath = path.relative(process.cwd(), absolutePath).split(path.sep).join('/');
        if (await this.cleanupRepository.isAvatarPathReferenced(relativePath)) continue;

        orphanFiles += 1;
        if (!config.cleanup.dryRun) {
          try {
            await fs.unlink(absolutePath);
          } catch (error: any) {
            if (error?.code !== 'ENOENT') throw error;
          }
        }
      }

      if (directory !== avatarRoot) {
        try {
          await fs.rmdir(directory);
        } catch (error: any) {
          if (!['ENOENT', 'ENOTEMPTY'].includes(error?.code)) throw error;
        }
      }
    };

    await walk(avatarRoot);
    return orphanFiles;
  }
}
