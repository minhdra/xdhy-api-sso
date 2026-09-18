import { container } from 'tsyringe';

import { config } from '../config/config';
import { CleanupService } from '../services/cleanupService';

export const startDataCleanupJob = (): (() => void) => {
  if (!config.cleanup.enabled) return () => undefined;

  let running = false;
  const run = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const result = await container.resolve(CleanupService).run();
      if (!result.acquired) {
        console.log('[data-cleanup] Bỏ qua vì instance khác đang chạy.');
      } else {
        console.log(
          `[data-cleanup]${config.cleanup.dryRun ? ' DRY-RUN' : ''} ` +
            `reset=${result.counts.password_reset_tokens}, ` +
            `refresh=${result.counts.refresh_tokens}, session=${result.counts.sessions}`,
        );
      }
    } catch (error) {
      console.error('[data-cleanup] Lỗi khi chạy job:', error);
    } finally {
      running = false;
    }
  };

  const initialTimer = setTimeout(() => void run(), config.cleanup.initialDelayMs ?? 2 * 60 * 1000);
  initialTimer.unref();
  const intervalTimer = setInterval(() => void run(), config.cleanup.intervalMs ?? 24 * 60 * 60 * 1000);
  intervalTimer.unref();

  return () => {
    clearTimeout(initialTimer);
    clearInterval(intervalTimer);
  };
};
