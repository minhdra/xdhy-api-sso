export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    // Dữ liệu kèm theo để FE xử lý tiếp (vd 409 trùng tài khoản đã xoá).
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
