/* eslint-disable no-console */
// Copy dữ liệu user/tổ chức/nhóm quyền + bảng a_* từ build_management sang
// sso_management — dùng lúc cutover (tách DB, 26/09/2026).
//
//   node scripts/sso-management/copy-data.js --dry-run   (chỉ đếm dòng 2 bên)
//   node scripts/sso-management/copy-data.js             (copy thật)
//
// - Nguồn CHỈ ĐỌC. Không xoá/sửa gì ở build_management.
// - Đích: TRUNCATE các bảng liên quan rồi chép lại toàn bộ, giữ nguyên ID +
//   password hash, trong 1 transaction (lỗi giữa chừng -> rollback, đích giữ
//   nguyên). Chạy lại nhiều lần được (vd copy thử trước ngày cutover, rồi copy
//   lần cuối trong cửa sổ bảo trì).
// - Sau khi api-sso đã chạy thật trên sso_management thì KHÔNG chạy lại (sẽ đè
//   mất dữ liệu mới) - script chặn nếu đích có dòng mới hơn nguồn, trừ khi
//   truyền --force.
require('dotenv').config({ path: process.env.ENV_FILE || '.env' });
const { Client } = require('pg');

const SOURCE = process.env.SOURCE_DB_NAME || 'build_management';
const TARGET = process.env.TARGET_DB_NAME || 'sso_management';

// Thứ tự insert theo FK (cha trước con).
const TABLES = [
  'system_users',
  'user_profiles',
  'branch',
  'department',
  'positions',
  'employee',
  'roles',
  'user_roles',
  'a_app',
  'a_app_access',
  'a_session',
  'a_refresh_token',
  'a_password_reset_token',
];

const BATCH = 500;
const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');

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

async function count(client, table) {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM public.${table}`);
  return rows[0].n;
}

async function columns(client, table) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [table],
  );
  return rows.map((r) => r.column_name);
}

// Dấu hiệu sso_management đã chạy thật: có user được tạo sau lần copy gần nhất
// mà nguồn không có.
async function targetHasNewUsers(source, target) {
  const { rows } = await target.query('SELECT user_id FROM system_users');
  if (!rows.length) return false;
  const { rows: missing } = await source.query(
    'SELECT count(*)::int AS n FROM unnest($1::varchar[]) id WHERE NOT EXISTS (SELECT 1 FROM system_users s WHERE s.user_id = id)',
    [rows.map((r) => r.user_id)],
  );
  return missing[0].n > 0;
}

async function main() {
  if (SOURCE === TARGET) throw new Error('SOURCE và TARGET trùng nhau');
  const source = await connect(SOURCE);
  const target = await connect(TARGET);
  try {
    console.log(`${SOURCE} -> ${TARGET}${dryRun ? ' (dry-run)' : ''}`);
    for (const t of TABLES) {
      console.log(`  ${t.padEnd(24)} nguồn=${await count(source, t)}  đích=${await count(target, t)}`);
    }
    if (dryRun) return;

    if (!force && (await targetHasNewUsers(source, target))) {
      throw new Error('Đích có user không tồn tại ở nguồn - có vẻ sso_management đã chạy thật. Dừng (dùng --force nếu chắc chắn).');
    }

    // Dùng REPEATABLE READ ở nguồn để mọi bảng đọc cùng 1 snapshot (FK nhất quán).
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await target.query('BEGIN');
    try {
      await target.query(`TRUNCATE ${[...TABLES].reverse().map((t) => `public.${t}`).join(', ')}`);
      for (const t of TABLES) {
        const targetCols = await columns(target, t);
        const sourceCols = new Set(await columns(source, t));
        const cols = targetCols.filter((c) => sourceCols.has(c));
        const colList = cols.map((c) => `"${c}"`).join(', ');
        const { rows } = await source.query(`SELECT ${colList} FROM public.${t}`);
        for (let i = 0; i < rows.length; i += BATCH) {
          const chunk = rows.slice(i, i + BATCH);
          const params = [];
          const values = chunk.map((row) => {
            const ph = cols.map((c) => {
              params.push(row[c]);
              return `$${params.length}`;
            });
            return `(${ph.join(', ')})`;
          });
          await target.query(
            `INSERT INTO public.${t} (${colList}) OVERRIDING SYSTEM VALUE VALUES ${values.join(', ')}`,
            params,
          );
        }
        const n = await count(target, t);
        if (n !== rows.length) throw new Error(`${t}: copy ${rows.length} nhưng đích có ${n}`);
        console.log(`  ✔ ${t}: ${n}`);
      }
      // Cột identity (branch/department/positions): đẩy sequence qua max id đã
      // chép, không thì Insert* tiếp theo đụng khoá chính.
      const { rows: idCols } = await target.query(
        `SELECT c.relname AS table_name, a.attname AS column_name
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND a.attidentity <> '' AND c.relname = ANY($1)`,
        [TABLES],
      );
      for (const { table_name: t, column_name: col } of idCols) {
        await target.query(
          `SELECT setval(pg_get_serial_sequence($1, $2), GREATEST((SELECT max("${col}") FROM public.${t}), 1))`,
          [`public.${t}`, col],
        );
      }
      await target.query('COMMIT');
      await source.query('COMMIT');
      console.log('Xong.');
    } catch (err) {
      await target.query('ROLLBACK');
      await source.query('ROLLBACK');
      throw err;
    }
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
