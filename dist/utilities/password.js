"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPassword = exports.isBcryptHash = exports.hashPassword = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const md5_1 = __importDefault(require("md5"));
const SALT_ROUNDS = 10;
const BCRYPT_PREFIX = /^\$2[aby]\$/;
const hashPassword = (plain) => bcrypt_1.default.hash(plain, SALT_ROUNDS);
exports.hashPassword = hashPassword;
const isBcryptHash = (value) => typeof value === 'string' && BCRYPT_PREFIX.test(value);
exports.isBcryptHash = isBcryptHash;
const verifyPassword = (plain, storedHash) => (0, exports.isBcryptHash)(storedHash)
    ? bcrypt_1.default.compare(plain, storedHash)
    : Promise.resolve((0, md5_1.default)(plain) === storedHash);
exports.verifyPassword = verifyPassword;
