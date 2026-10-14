/* eslint-disable no-console */
// Chép trọng số cấp bậc chức vụ (positions.rank_weight) đang dùng ở task_management sang
// sso_management (nguồn chính từ 14/10/2026, migration 0014) và build_management (bản sao).
// Chạy 1 lần SAU migration 0014, TRƯỚC khi bật đồng bộ chức vụ mang rank_weight - nếu không, lần
// đồng bộ chức vụ kế tiếp sẽ ghi đè trọng số bên task bằng NULL.
//
//   node scripts/sso-management/backfill-position-rank-weight.js            (chỉ in kế hoạch)
//   node scripts/sso-management/backfill-position-rank-weight.js --apply    (ghi)
//
// Chỉ điền cột đang NULL (không ghi đè trọng số đã nhập ở SSO) và chỉ cho chức vụ cùng position_id
// + cùng tên (tên khác = nghi ngờ lệch id, bỏ qua và báo).
require('dotenv').config({ path: process.env.ENV_FILE || '.env' });
const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const connect = async (database) => {
  const c = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database,
    connectionTimeoutMillis: 15000,
  });
  await c.connect();
  return c;
};

async function main() {
  const task = await connect(process.env.TASK_DB_NAME || 'task_management');
  const { rows: src } = await task.query(
    'SELECT position_id, position_name, rank_weight FROM positions WHERE active_flag = 1 AND rank_weight IS NOT NULL ORDER BY position_id',
  );
  await task.end();
  console.log(`Nguồn task_management: ${src.length} chức vụ có trọng số`);

  for (const db of ['sso_management', 'build_management']) {
    const c = await connect(db);
    let changed = 0;
    for (const s of src) {
      const { rows } = await c.query(
        'SELECT position_name, rank_weight FROM positions WHERE position_id = $1 AND active_flag = 1',
        [s.position_id],
      );
      const t = rows[0];
      if (!t) { console.log(`  [${db}] #${s.position_id} ${s.position_name}: không có - bỏ qua`); continue; }
      if (t.position_name !== s.position_name) { console.log(`  [${db}] #${s.position_id} tên lệch ("${t.position_name}" ≠ "${s.position_name}") - bỏ qua`); continue; }
      if (t.rank_weight !== null) { console.log(`  [${db}] #${s.position_id} ${s.position_name}: đã có ${t.rank_weight} - giữ`); continue; }
      console.log(`  [${db}] #${s.position_id} ${s.position_name}: NULL -> ${s.rank_weight}${APPLY ? '' : ' (dry-run)'}`);
      if (APPLY) await c.query('UPDATE positions SET rank_weight = $2 WHERE position_id = $1 AND rank_weight IS NULL', [s.position_id, s.rank_weight]);
      changed++;
    }
    console.log(`[${db}] ${APPLY ? 'đã ghi' : 'sẽ ghi'} ${changed} dòng`);
    await c.end();
  }
}

main().catch((e) => { console.error('LỖI:', e.message); process.exit(1); });
