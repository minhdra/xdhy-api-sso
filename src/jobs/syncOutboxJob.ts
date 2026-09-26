import { container } from 'tsyringe';

import { config } from '../config/config';
import { registerSyncWorkerWake, SyncService } from '../services/syncService';

// Worker đồng bộ SSO -> app: quét a_sync_outbox theo chu kỳ + được đánh thức
// ngay khi có sự kiện mới (SyncService.notify). Chạy nhiều instance an toàn -
// mỗi dòng được "lease" trước khi gửi (xem SyncOutboxRepository.claimHead).
export const startSyncOutboxJob = (): (() => void) => {
  if (!config.sync.enabled) return () => undefined;

  let running = false;
  let again = false;
  let lastPurge = 0;

  const run = async (): Promise<void> => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      const service = container.resolve(SyncService);
      do {
        again = false;
        const { sent } = await service.runOnce();
        if (sent > 0) again = true; // còn dòng thì quét tiếp ngay
      } while (again);

      if (Date.now() - lastPurge > 6 * 60 * 60 * 1000) {
        lastPurge = Date.now();
        const purged = await service.purgeDone();
        if (purged) console.log(`[sync] dọn ${purged} dòng outbox đã xong`);
      }
    } catch (error) {
      console.error('[sync] lỗi worker:', (error as Error).message);
    } finally {
      running = false;
    }
  };

  registerSyncWorkerWake(() => void run());
  const timer = setInterval(() => void run(), config.sync.intervalMs);
  timer.unref();
  const initial = setTimeout(() => void run(), 3000);
  initial.unref();

  return () => {
    registerSyncWorkerWake(null);
    clearInterval(timer);
    clearTimeout(initial);
  };
};
