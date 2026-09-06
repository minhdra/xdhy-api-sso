import { Pool, PoolClient } from 'pg';
import { singleton } from 'tsyringe';

import { AppError } from '../errors/AppError';

import { config } from './config';

const connectionConfig = {
  host: config.db.host,
  port: config.db.port,
  user: config.db.username,
  password: config.db.password,
  database: config.db.database,

  max: config.db.poolMax,
  min: config.db.poolMin,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 10000,

  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,

  query_timeout: config.db.queryTimeout,
  statement_timeout: config.db.queryTimeout,
};

// Copy nguyên văn từ api-core/src/config/database.ts (pool + circuit breaker +
// retry) - CHỈ khác biệt cố ý: thêm method `raw()` ở cuối file, dùng cho 2
// bảng mới a_session/a_refresh_token (SQL thuần, không theo quy ước
// stored-procedure p_error_code/p_result như phần còn lại của DB). Xem plan
// mục 3 ("File cần tạo/sửa") - đây là điểm khác biệt duy nhất so với bản gốc
// ngoài jwt.ts/cookie.ts.
@singleton()
export class Database {
  private readonly pool: Pool;

  private consecutiveAcquireFailures = 0;
  private circuitOpenUntil = 0;
  private static readonly CIRCUIT_FAILURE_THRESHOLD = 5;
  private static readonly CIRCUIT_COOLDOWN_MS = 5000;

  constructor() {
    this.pool = new Pool(connectionConfig);

    this.pool.on('error', (error) => {
      console.error('PostgreSQL Pool Error:', error);
    });
  }

  private async acquireConnection(): Promise<PoolClient> {
    if (Date.now() < this.circuitOpenUntil) {
      throw new AppError(503, 'Cơ sở dữ liệu đang quá tải, vui lòng thử lại sau ít phút');
    }

    try {
      const connection = await this.pool.connect();
      this.consecutiveAcquireFailures = 0;
      return connection;
    } catch (error) {
      this.consecutiveAcquireFailures += 1;

      if (this.consecutiveAcquireFailures >= Database.CIRCUIT_FAILURE_THRESHOLD) {
        this.circuitOpenUntil = Date.now() + Database.CIRCUIT_COOLDOWN_MS;
        console.error(
          `PostgreSQL: acquire connection hỏng ${this.consecutiveAcquireFailures} lần liên tiếp - ` +
            `mở circuit breaker ${Database.CIRCUIT_COOLDOWN_MS}ms`,
        );
      }

      throw error;
    }
  }

  private static readonly connectionErrorCodes = [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EPIPE',
    '57P01',
    '57P02',
    '57P03',
    '08000',
    '08003',
    '08006',
  ];

  private static readonly connectionErrorMessages = ['Connection terminated'];

  private isConnectionError(error: any): boolean {
    return (
      Database.connectionErrorCodes.includes(error?.code) ||
      Database.connectionErrorMessages.some((msg) => error?.message?.includes(msg))
    );
  }

  private async retryOnConnectionError<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseRetryDelay: number = 300,
  ): Promise<T> {
    let attempt = 0;

    while (true) {
      try {
        return await fn();
      } catch (error: any) {
        attempt++;

        if (!this.isConnectionError(error) || attempt >= maxRetries) {
          throw error;
        }

        console.warn(
          `PostgreSQL connection error ${error?.code ?? error?.message}. Retry ${attempt}/${maxRetries - 1}`,
        );

        await new Promise((resolve) => setTimeout(resolve, baseRetryDelay * 2 ** (attempt - 1)));
      }
    }
  }

  private releaseConnection(connection: PoolClient | null, error?: unknown): void {
    if (!connection) return;

    if (error && this.isConnectionError(error)) {
      connection.release(error as Error);
    } else {
      connection.release();
    }
  }

  public async query(sql: string, values: any[] = []): Promise<any | null> {
    return this.retryOnConnectionError(async () => {
      let connection: PoolClient | null = null;

      try {
        connection = await this.acquireConnection();

        const result = await connection.query(sql, values);

        if (!result.rows || result.rows.length === 0) {
          return null;
        }

        const output = result.rows[0];

        const errorCode = Number(output.p_error_code ?? 0);

        const errorMessage = output.p_error_message ?? '';

        if (errorCode !== 0) {
          throw new Error(errorMessage || 'Stored procedure execution error');
        }

        const pResult = output.p_result;

        if (!pResult) {
          return null;
        }

        if (Array.isArray(pResult.rows)) {
          if (pResult.rows.length === 0) {
            return null;
          }

          return pResult.rows[0];
        }

        return pResult;
      } catch (error) {
        this.releaseConnection(connection, error);
        connection = null;
        throw error;
      } finally {
        connection?.release();
      }
    });
  }

  public async queryObject(sql: string, values: any[] = []): Promise<any | null> {
    return this.retryOnConnectionError(async () => {
      let connection: PoolClient | null = null;

      try {
        connection = await this.acquireConnection();

        const result = await connection.query(sql, values);

        if (!result.rows || result.rows.length === 0) {
          return null;
        }

        const output = result.rows[0];

        const errorCode = Number(output.p_error_code ?? 0);

        const errorMessage = output.p_error_message ?? '';

        if (errorCode !== 0) {
          throw new Error(errorMessage || 'Stored procedure execution error');
        }

        const pResult = output.p_result;

        if (!pResult) {
          return null;
        }

        return pResult;
      } catch (error) {
        this.releaseConnection(connection, error);
        connection = null;
        throw error;
      } finally {
        connection?.release();
      }
    });
  }

  public async queryList(
    sql: string,
    values: any[] = [],
  ): Promise<{ rows: any[]; record_count: number }> {
    return this.retryOnConnectionError(async () => {
      let connection: PoolClient | null = null;

      try {
        connection = await this.acquireConnection();

        const result = await connection.query(sql, values);

        if (!result.rows || result.rows.length === 0) {
          return { rows: [], record_count: 0 };
        }

        const output = result.rows[0];

        const errorCode = Number(output.p_error_code ?? 0);

        const errorMessage = output.p_error_message ?? '';

        if (errorCode !== 0) {
          throw new Error(errorMessage || 'Stored procedure execution error');
        }

        const pResult = output.p_result;

        if (!pResult) {
          return { rows: [], record_count: 0 };
        }

        if (Array.isArray(pResult)) {
          return { rows: pResult, record_count: pResult.length };
        }

        if (Array.isArray(pResult.rows)) {
          return {
            rows: pResult.rows,
            record_count: pResult.record_count ?? pResult.rows.length,
          };
        }

        return { rows: [], record_count: 0 };
      } catch (error) {
        this.releaseConnection(connection, error);
        connection = null;
        throw error;
      } finally {
        connection?.release();
      }
    });
  }

  // Khác biệt cố ý so với bản gốc: SQL thuần cho a_session/a_refresh_token
  // (bảng mới của riêng api-sso, không qua stored procedure) - trả thẳng
  // result.rows, không unwrap theo quy ước p_error_code/p_result.
  public async raw(sql: string, values: any[] = []): Promise<any[]> {
    return this.retryOnConnectionError(async () => {
      let connection: PoolClient | null = null;

      try {
        connection = await this.acquireConnection();
        const result = await connection.query(sql, values);
        return result.rows ?? [];
      } catch (error) {
        this.releaseConnection(connection, error);
        connection = null;
        throw error;
      } finally {
        connection?.release();
      }
    });
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}
