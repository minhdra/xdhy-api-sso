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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PasswordResetRepository = void 0;
const tsyringe_1 = require("tsyringe");
const database_1 = require("../config/database");
// Bảng mới của riêng api-sso (a_password_reset_token, xem db/migrations/) - SQL
// thuần qua Database.raw(), cùng quy ước với SessionRepository.
let PasswordResetRepository = class PasswordResetRepository {
    constructor(db) {
        this.db = db;
    }
    async create(params) {
        await this.db.raw(`INSERT INTO a_password_reset_token (token_hash, user_id, expires_at)
       VALUES ($1, $2, now() + ($3 * interval '1 millisecond'))`, [params.tokenHash, params.userId, params.ttlMs]);
    }
    async findValid(tokenHash) {
        const rows = await this.db.raw(`SELECT user_id FROM a_password_reset_token
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`, [tokenHash]);
        return rows[0] ?? null;
    }
    async markUsed(tokenHash) {
        await this.db.raw(`UPDATE a_password_reset_token SET used_at = now() WHERE token_hash = $1`, [
            tokenHash,
        ]);
    }
};
exports.PasswordResetRepository = PasswordResetRepository;
exports.PasswordResetRepository = PasswordResetRepository = __decorate([
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [database_1.Database])
], PasswordResetRepository);
