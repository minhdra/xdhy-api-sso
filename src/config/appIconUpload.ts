import fs from 'fs/promises';
import path from 'path';

import multer from 'multer';
import { AppError } from '../errors/AppError';

const ROOT = path.resolve(process.cwd(), 'uploads/app-icons');
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export const appIconUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
}).single('file');

export function appIconPath(appId: string): string {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(appId)) throw new AppError(400, 'Mã ứng dụng không hợp lệ.');
  return path.join(ROOT, `${appId}.png`);
}

export function assertAppIcon(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
  if (!file || file.mimetype !== 'image/png' || file.buffer.length < 24 ||
      !file.buffer.subarray(0, 8).equals(PNG_SIGNATURE) ||
      file.buffer.readUInt32BE(16) !== 46 || file.buffer.readUInt32BE(20) !== 46) {
    throw new AppError(400, 'Icon phải là ảnh PNG 46 × 46 và tối đa 1MB.');
  }
}

export async function saveAppIcon(appId: string, buffer: Buffer): Promise<void> {
  const target = appIconPath(appId);
  await fs.mkdir(ROOT, { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, buffer);
  await fs.rename(temporary, target);
}

export async function removeAppIcon(appId: string): Promise<void> {
  await fs.rm(appIconPath(appId), { force: true });
}
