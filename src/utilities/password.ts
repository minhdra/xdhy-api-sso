import bcrypt from 'bcrypt';
import md5 from 'md5';

const SALT_ROUNDS = 10;
const BCRYPT_PREFIX = /^\$2[aby]\$/;

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, SALT_ROUNDS);

export const isBcryptHash = (value: unknown): value is string =>
  typeof value === 'string' && BCRYPT_PREFIX.test(value);

export const verifyPassword = (plain: string, storedHash: unknown): Promise<boolean> =>
  isBcryptHash(storedHash)
    ? bcrypt.compare(plain, storedHash)
    : Promise.resolve(md5(plain) === storedHash);
