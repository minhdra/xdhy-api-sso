"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var Database_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Database = void 0;
const pg_1 = require("pg");
const tsyringe_1 = require("tsyringe");
const AppError_1 = require("../errors/AppError");
const config_1 = require("./config");
const connectionConfig = {
    host: config_1.config.db.host,
    port: config_1.config.db.port,
    user: config_1.config.db.username,
    password: config_1.config.db.password,
    database: config_1.config.db.database,
    max: config_1.config.db.poolMax,
    min: config_1.config.db.poolMin,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    query_timeout: config_1.config.db.queryTimeout,
    statement_timeout: config_1.config.db.queryTimeout,
};
// Copy nguyên văn từ api-core/src/config/database.ts (pool + circuit breaker +
// retry) - CHỈ khác biệt cố ý: thêm method `raw()` ở cuối file, dùng cho 2
// bảng mới a_session/a_refresh_token (SQL thuần, không theo quy ước
// stored-procedure p_error_code/p_result như phần còn lại của DB). Xem plan
// mục 3 ("File cần tạo/sửa") - đây là điểm khác biệt duy nhất so với bản gốc
// ngoài jwt.ts/cookie.ts.
let Database = Database_1 = class Database {
    constructor() {
        this.consecutiveAcquireFailures = 0;
        this.circuitOpenUntil = 0;
        this.pool = new pg_1.Pool(connectionConfig);
        this.pool.on('error', (error) => {
            console.error('PostgreSQL Pool Error:', error);
        });
    }
    async acquireConnection() {
        if (Date.now() < this.circuitOpenUntil) {
            throw new AppError_1.AppError(503, 'Cơ sở dữ liệu đang quá tải, vui lòng thử lại sau ít phút');
        }
        try {
            const connection = await this.pool.connect();
            this.consecutiveAcquireFailures = 0;
            return connection;
        }
        catch (error) {
            this.consecutiveAcquireFailures += 1;
            if (this.consecutiveAcquireFailures >= Database_1.CIRCUIT_FAILURE_THRESHOLD) {
                this.circuitOpenUntil = Date.now() + Database_1.CIRCUIT_COOLDOWN_MS;
                console.error(`PostgreSQL: acquire connection hỏng ${this.consecutiveAcquireFailures} lần liên tiếp - ` +
                    `mở circuit breaker ${Database_1.CIRCUIT_COOLDOWN_MS}ms`);
            }
            throw error;
        }
    }
    isConnectionError(error) {
        return (Database_1.connectionErrorCodes.includes(error?.code) ||
            Database_1.connectionErrorMessages.some((msg) => error?.message?.includes(msg)));
    }
    async retryOnConnectionError(fn, maxRetries = 3, baseRetryDelay = 300) {
        let attempt = 0;
        while (true) {
            try {
                return await fn();
            }
            catch (error) {
                attempt++;
                if (!this.isConnectionError(error) || attempt >= maxRetries) {
                    throw error;
                }
                console.warn(`PostgreSQL connection error ${error?.code ?? error?.message}. Retry ${attempt}/${maxRetries - 1}`);
                await new Promise((resolve) => setTimeout(resolve, baseRetryDelay * 2 ** (attempt - 1)));
            }
        }
    }
    releaseConnection(connection, error) {
        if (!connection)
            return;
        if (error && this.isConnectionError(error)) {
            connection.release(error);
        }
        else {
            connection.release();
        }
    }
    async query(sql, values = []) {
        return this.retryOnConnectionError(async () => {
            let connection = null;
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
            }
            catch (error) {
                this.releaseConnection(connection, error);
                connection = null;
                throw error;
            }
            finally {
                connection?.release();
            }
        });
    }
    async queryObject(sql, values = []) {
        return this.retryOnConnectionError(async () => {
            let connection = null;
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
            }
            catch (error) {
                this.releaseConnection(connection, error);
                connection = null;
                throw error;
            }
            finally {
                connection?.release();
            }
        });
    }
    async queryList(sql, values = []) {
        return this.retryOnConnectionError(async () => {
            let connection = null;
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
            }
            catch (error) {
                this.releaseConnection(connection, error);
                connection = null;
                throw error;
            }
            finally {
                connection?.release();
            }
        });
    }
    // Khác biệt cố ý so với bản gốc: SQL thuần cho a_session/a_refresh_token
    // (bảng mới của riêng api-sso, không qua stored procedure) - trả thẳng
    // result.rows, không unwrap theo quy ước p_error_code/p_result.
    async raw(sql, values = []) {
        return this.retryOnConnectionError(async () => {
            let connection = null;
            try {
                connection = await this.acquireConnection();
                const result = await connection.query(sql, values);
                return result.rows ?? [];
            }
            catch (error) {
                this.releaseConnection(connection, error);
                connection = null;
                throw error;
            }
            finally {
                connection?.release();
            }
        });
    }
    async close() {
        await this.pool.end();
    }
};
exports.Database = Database;
Database.CIRCUIT_FAILURE_THRESHOLD = 5;
Database.CIRCUIT_COOLDOWN_MS = 5000;
Database.connectionErrorCodes = [
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
Database.connectionErrorMessages = ['Connection terminated'];
exports.Database = Database = Database_1 = __decorate([
    (0, tsyringe_1.singleton)(),
    __metadata("design:paramtypes", [])
], Database);
