"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJwk = exports.verifyToken = exports.generateRefreshToken = exports.generateAccessToken = void 0;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("./config");
// RS256: api-sso giữ private key (đọc 1 lần lúc khởi động), ký mọi token
// bằng key này. Các service khác chỉ verify bằng public key lấy qua JWKS
// (xem routes/wellKnown.ts) - không còn JWT_SECRET dùng chung nữa.
const privateKey = fs_1.default.readFileSync(config_1.config.jwt.privateKeyPath, 'utf8');
// api-sso tự verify token của chính nó (đọc refresh cookie ở /refresh, /logout)
// - suy public key thẳng từ private key đang có, khỏi phải đọc thêm 1 file
// public.pem riêng hay tự gọi JWKS endpoint của chính mình.
const publicKeyForSelfVerify = crypto_1.default
    .createPublicKey(privateKey)
    .export({ format: 'pem', type: 'spki' });
const generateAccessToken = (payload, expiresIn = config_1.config.jwt.accessExpiresIn) => {
    return jsonwebtoken_1.default.sign({ ...payload, type: 'access' }, privateKey, {
        algorithm: 'RS256',
        expiresIn: expiresIn,
        keyid: config_1.config.jwt.kid,
    });
};
exports.generateAccessToken = generateAccessToken;
const generateRefreshToken = (payload, expiresIn = config_1.config.jwt.refreshExpiresIn) => {
    return jsonwebtoken_1.default.sign({ ...payload, type: 'refresh' }, privateKey, {
        algorithm: 'RS256',
        expiresIn: expiresIn,
        keyid: config_1.config.jwt.kid,
    });
};
exports.generateRefreshToken = generateRefreshToken;
const verifyToken = (token) => {
    try {
        return jsonwebtoken_1.default.verify(token, publicKeyForSelfVerify, { algorithms: ['RS256'] });
    }
    catch {
        return null;
    }
};
exports.verifyToken = verifyToken;
// Public key ở dạng JWK, dùng cho endpoint /.well-known/jwks.json.
const getJwk = () => {
    const publicKey = crypto_1.default.createPublicKey(privateKey);
    const jwk = publicKey.export({ format: 'jwk' });
    return { ...jwk, alg: 'RS256', use: 'sig', kid: config_1.config.jwt.kid };
};
exports.getJwk = getJwk;
