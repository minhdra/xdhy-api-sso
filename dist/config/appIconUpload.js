"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appIconUpload = void 0;
exports.assertAppIcon = assertAppIcon;
exports.saveAppIcon = saveAppIcon;
exports.removeAppIcon = removeAppIcon;
const crypto_1 = require("crypto");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
const AppError_1 = require("../errors/AppError");
const ROOT = path_1.default.resolve(process.cwd(), 'uploads/app-icons');
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
exports.appIconUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 1024 * 1024 },
}).single('file');
function assertAppId(appId) {
    if (!/^[a-zA-Z0-9-]{1,64}$/.test(appId))
        throw new AppError_1.AppError(400, 'Mã ứng dụng không hợp lệ.');
}
function assertAppIcon(file) {
    if (!file || file.mimetype !== 'image/png' || file.buffer.length < 24 ||
        !file.buffer.subarray(0, 8).equals(PNG_SIGNATURE) ||
        file.buffer.readUInt32BE(16) !== 138 || file.buffer.readUInt32BE(20) !== 138) {
        throw new AppError_1.AppError(400, 'Icon phải là ảnh PNG 138 × 138 và tối đa 1MB.');
    }
}
async function saveAppIcon(appId, buffer) {
    assertAppId(appId);
    await promises_1.default.mkdir(ROOT, { recursive: true });
    const filename = `${appId}-${(0, crypto_1.randomUUID)()}.png`;
    await promises_1.default.writeFile(path_1.default.join(ROOT, filename), buffer, { flag: 'wx' });
    return `/api-sso/uploads/app-icons/${filename}`;
}
async function removeAppIcon(appId, keepUrl) {
    assertAppId(appId);
    const filenames = await promises_1.default.readdir(ROOT).catch((error) => {
        if (error.code === 'ENOENT')
            return [];
        throw error;
    });
    const keepName = keepUrl?.split('/').pop();
    await Promise.all(filenames.filter((filename) => (filename === `${appId}.png` || /^.+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/.test(filename) && filename.startsWith(`${appId}-`)) &&
        filename !== keepName).map((filename) => promises_1.default.rm(path_1.default.join(ROOT, filename), { force: true })));
}
