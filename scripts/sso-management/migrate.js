/* eslint-disable no-console */
// Chạy migration db/sso_management/*.sql lên DB sso_management theo thứ tự tên file.
// Mỗi file 1 transaction; file đã chạy ghi vào bảng a_schema_migration nên chạy lại
// chỉ áp file mới (không cần psql - máy dev/server không có sẵn).
//
//   node scripts/sso-management/migrate.js --create-db   (tạo DB nếu chưa có, rồi migrate)
//   node scripts/sso-management/migrate.js               (chỉ migrate)
//
// Kết nối lấy DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD từ .env (hoặc ENV_FILE);
// tên DB đích = TARGET_DB_NAME || 'sso_management' (không lấy DB_NAME để tránh
// lỡ tay migrate nhầm vào build_management khi .env chưa đổi).
require('dotenv').config({ path: process.env.ENV_FILE || '.env' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const TARGET = process.env.TARGET_DB_NAME || 'sso_management';
const DIR = path.resolve(__dirname, '../../db/sso_management');

function connect(database) {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database,
  });
  return client.connect().then(() => client);
}

async function createDbIfMissing() {
  const admin = await connect('postgres');
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TARGET]);
    if (rowCount) {
      console.log(`DB ${TARGET} đã tồn tại`);
      return;
    }
    // Tên DB không tham số hoá được - chỉ nhận slug an toàn.
    if (!/^[a-z_][a-z0-9_]*$/.test(TARGET)) throw new Error(`Tên DB không hợp lệ: ${TARGET}`);
    await admin.query(`CREATE DATABASE ${TARGET} ENCODING 'UTF8' TEMPLATE template0`);
    console.log(`Đã tạo DB ${TARGET}`);
  } finally {
    await admin.end();
  }
}

async function main() {
  if (process.argv.includes('--create-db')) await createDbIfMissing();

  const client = await connect(TARGET);
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS a_schema_migration (
      filename varchar(255) PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query('SELECT filename FROM a_schema_migration');
    const applied = new Set(rows.map((r) => r.filename));
    const files = fs
      .readdirSync(DIR)
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO a_schema_migration(filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`✔ ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`${file}: ${err.message}`);
      }
    }
    console.log(`Xong - ${TARGET} đã áp ${files.length} file`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
