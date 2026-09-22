"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appIconUpload = void 0;
exports.appIconPath = appIconPath;
exports.assertAppIcon = assertAppIcon;
exports.saveAppIcon = saveAppIcon;
exports.removeAppIcon = removeAppIcon;
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
function appIconPath(appId) {
    if (!/^[a-zA-Z0-9-]{1,64}$/.test(appId))
        throw new AppError_1.AppError(400, 'Mã ứng dụng không hợp lệ.');
    return path_1.default.join(ROOT, `${appId}.png`);
}
function assertAppIcon(file) {
    if (!file || file.mimetype !== 'image/png' || file.buffer.length < 24 ||
        !file.buffer.subarray(0, 8).equals(PNG_SIGNATURE) ||
        file.buffer.readUInt32BE(16) !== 46 || file.buffer.readUInt32BE(20) !== 46) {
        throw new AppError_1.AppError(400, 'Icon phải là ảnh PNG 46 × 46 và tối đa 1MB.');
    }
}
async function saveAppIcon(appId, buffer) {
    const target = appIconPath(appId);
    await promises_1.default.mkdir(ROOT, { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    await promises_1.default.writeFile(temporary, buffer);
    await promises_1.default.rename(temporary, target);
}
async function removeAppIcon(appId) {
    await promises_1.default.rm(appIconPath(appId), { force: true });
}
