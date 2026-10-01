import crypto from 'crypto';
import fs from 'fs';

import jwt, { type SignOptions } from 'jsonwebtoken';

import { config } from './config';

// RS256: api-sso giữ private key (đọc 1 lần lúc khởi động), ký mọi token
// bằng key này. Các service khác chỉ verify bằng public key lấy qua JWKS
// (xem routes/wellKnown.ts) - không còn JWT_SECRET dùng chung nữa.
const privateKey = fs.readFileSync(config.jwt.privateKeyPath, 'utf8');

// api-sso tự verify token của chính nó (đọc refresh cookie ở /refresh, /logout)
// - suy public key thẳng từ private key đang có, khỏi phải đọc thêm 1 file
// public.pem riêng hay tự gọi JWKS endpoint của chính mình.
const publicKeyForSelfVerify = crypto
  .createPublicKey(privateKey)
  .export({ format: 'pem', type: 'spki' });

export const generateAccessToken = (
  payload: object,
  expiresIn: string = config.jwt.accessExpiresIn,
): string => {
  return jwt.sign({ ...payload, type: 'access' }, privateKey, {
    algorithm: 'RS256',
    expiresIn: expiresIn as SignOptions['expiresIn'],
    keyid: config.jwt.kid,
  });
};

export const generateRefreshToken = (
  payload: object,
  expiresIn: string = config.jwt.refreshExpiresIn,
): string => {
  return jwt.sign({ ...payload, type: 'refresh' }, privateKey, {
    algorithm: 'RS256',
    expiresIn: expiresIn as SignOptions['expiresIn'],
    keyid: config.jwt.kid,
  });
};

export const verifyToken = (token: string): any => {
  try {
    return jwt.verify(token, publicKeyForSelfVerify, { algorithms: ['RS256'] });
  } catch {
    return null;
  }
};

// Public key ở dạng JWK, dùng cho endpoint /.well-known/jwks.json.
export const getJwk = () => {
  const publicKey = crypto.createPublicKey(privateKey);
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
  return { ...jwk, alg: 'RS256', use: 'sig', kid: config.jwt.kid };
};
