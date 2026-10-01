import { randomUUID } from 'crypto';
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

function assertAppId(appId: string): void {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(appId)) throw new AppError(400, 'Mã ứng dụng không hợp lệ.');
}

export function assertAppIcon(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
  if (!file || file.mimetype !== 'image/png' || file.buffer.length < 24 ||
      !file.buffer.subarray(0, 8).equals(PNG_SIGNATURE) ||
      file.buffer.readUInt32BE(16) !== 138 || file.buffer.readUInt32BE(20) !== 138) {
    throw new AppError(400, 'Icon phải là ảnh PNG 138 × 138 và tối đa 1MB.');
  }
}

export async function saveAppIcon(appId: string, buffer: Buffer): Promise<string> {
  assertAppId(appId);
  await fs.mkdir(ROOT, { recursive: true });
  const filename = `${appId}-${randomUUID()}.png`;
  await fs.writeFile(path.join(ROOT, filename), buffer, { flag: 'wx' });
  return `/api-sso/uploads/app-icons/${filename}`;
}

export async function removeAppIcon(appId: string, keepUrl?: string): Promise<void> {
  assertAppId(appId);
  const filenames = await fs.readdir(ROOT).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const keepName = keepUrl?.split('/').pop();
  await Promise.all(filenames.filter((filename) =>
    (filename === `${appId}.png` || /^.+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/.test(filename) && filename.startsWith(`${appId}-`)) &&
    filename !== keepName,
  ).map((filename) => fs.rm(path.join(ROOT, filename), { force: true })));
}
