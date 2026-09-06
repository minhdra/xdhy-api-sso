import env from '@ltv/env';

// Danh sách app hiển thị ở trang chủ sso-web. Config tĩnh (đã chốt với user):
// mọi tài khoản đăng nhập thấy cùng danh sách. Khi cần lọc theo quyền thì
// thay bằng bảng DB sso_app + sso_app_role (xem plan "Ngoài phạm vi").
export interface SsoApp {
  key: string;
  name: string;
  description: string;
  url: string;
  // Màu nền ô icon (chữ cái đầu tên).
  color: string;
}

export const SSO_APPS: SsoApp[] = [
  {
    key: 'build-web',
    name: 'Tài chính & Công việc',
    description: 'Quản lý tài chính và công việc',
    url: env('APP_BUILD_WEB_URL', 'http://localhost:3010'),
    color: '#2563a6',
  },
  // chat / meeting: thêm sau khi tích hợp SSO.
  {
    key: 'chatting',
    name: 'OLAZ',
    description: 'Ứng dụng chat nội bộ',
    url: env('APP_BUILD_WEB_URL', 'http://localhost:3010'),
    color: '#2563a6',
  },
  {
    key: 'meeting',
    name: 'GNITEEM',
    description: 'Ứng dụng họp trực tuyến',
    url: env('APP_BUILD_WEB_URL', 'http://localhost:3010'),
    color: '#2563a6',
  },
];
