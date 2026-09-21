"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SSO_APPS = void 0;
const env_1 = __importDefault(require("@ltv/env"));
exports.SSO_APPS = [
    {
        key: 'build-web',
        name: 'Tài chính & Công việc',
        description: 'Quản lý tài chính và công việc',
        url: (0, env_1.default)('APP_BUILD_WEB_URL', 'http://localhost:3010'),
        color: '#2563a6',
    },
    // chat / meeting: thêm sau khi tích hợp SSO.
    {
        key: 'chatting',
        name: 'OLAZ',
        description: 'Ứng dụng chat nội bộ',
        url: (0, env_1.default)('APP_BUILD_WEB_URL', 'http://localhost:3010'),
        color: '#2563a6',
    },
    {
        key: 'meeting',
        name: 'GNITEEM',
        description: 'Ứng dụng họp trực tuyến',
        url: (0, env_1.default)('APP_BUILD_WEB_URL', 'http://localhost:3010'),
        color: '#2563a6',
    },
];
