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

    return { acquired: true, counts: totals };
  }
}
