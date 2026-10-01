/* eslint-disable no-console */
// Sinh baseline schema cho DB sso_management từ build_management (chỉ ĐỌC nguồn).
//
// Chạy 1 lần lúc tách DB (26/09/2026) để lấy đúng định nghĩa bảng + proc đang
// chạy thật — không gõ tay lại, tránh lệch kiểu cột/proc. Kết quả commit vào
// db/sso_management/0001_baseline_tables.sql + 0002_baseline_procs.sql; sau đó
// mọi thay đổi schema sso_management đi bằng file migration mới, KHÔNG chạy lại
// script này đè lên.
//
//   node scripts/sso-management/generate-baseline.js            (đọc .env)
//   SOURCE_DB_NAME=build_management node scripts/...             (mặc định)
require('dotenv').config({ path: process.env.ENV_FILE || '.env' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Bảng mang sang. Thứ tự = thứ tự tạo (bảng được FK tham chiếu đứng trước).
// Không có `country` (không dùng ở đâu) và bảng tính năng (functions/actions/
// role_functions/role_permissions - thuộc từng app).
const TABLES = [
  'system_users',
  'user_profiles',
  'branch',
  'department',
  'positions',
  'employee',
  'roles',
  'user_roles',
  'a_session',
  'a_refresh_token',
  'a_password_reset_token',
  'a_app',
  'a_app_access',
];

// Cột thuộc app khác, không mang sang (positions.rank_weight do api-task quản).
const SKIP_COLUMNS = { positions: ['rank_weight'] };

// Proc/function mang sang: toàn bộ a_* + CRUD user/tổ chức/nhóm quyền.
// DeleteRole được viết lại ở 0003 (bản gốc đụng role_functions).
const ROUTINES = [
  // đăng nhập / tài khoản
  'GetUserByAccount',
  'GetUserById',
  'ResetPassword',
  'ResetPasswordByAdmin',
  'LockUser',
  // người dùng
  'SearchUser',
  'InsertUser',
  'UpdateUser',
  'DeleteUser',
  'GetEmployeeDropdown',
  'GetEmployeeDropdownbyEmployeeId',
  'DeleteEmployeeMulti',
  // chi nhánh / phòng ban / chức vụ
  'SearchBranch',
  'InsertBranch',
  'UpdateBranch',
  'DeleteBranchMulti',
  'GetBranchById',
  'GetBranchDropdown',
  'SearchDepartment',
  'InsertDepartment',
  'UpdateDepartment',
  'DeleteDepartmentMulti',
  'GetDepartmentById',
  'GetDepartmentDropdown',
  'SearchPosition',
  'InsertPosition',
  'UpdatePosition',
  'DeletePositionMulti',
  'GetPositionById',
  'GetPositionDropdown',
  // nhóm quyền + gán nhóm quyền
  'SearchRole',
  'InsertRole',
  'UpdateRole',
  'GetRoleById',
  'GetRoleDropdown',
  'GetRoleByUserId',
  'InsertUserRole',
  'DeleteUserRole',
];

const OUT_DIR = path.resolve(__dirname, '../../db/sso_management');

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.SOURCE_DB_NAME || 'build_management',
  });
  await client.connect();

  const tableSql = [];
  for (const table of TABLES) {
    tableSql.push(await tableDdl(client, table));
  }

  const routineSql = [];
  const { rows: routineRows } = await client.query(
    `SELECT p.proname, pg_get_functiondef(p.oid) AS def
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND (p.proname = ANY($1) OR p.proname LIKE 'a\\_%')
     ORDER BY p.proname, p.oid`,
    [ROUTINES],
  );
  const found = new Set(routineRows.map((r) => r.proname));
  const missing = ROUTINES.filter((r) => !found.has(r));
  if (missing.length) throw new Error(`Thiếu proc ở nguồn: ${missing.join(', ')}`);
  for (const row of routineRows) {
    routineSql.push(`${row.def.trimEnd()};\n`);
  }

  await client.end();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, '0001_baseline_tables.sql'),
    `${header('Bảng user/tổ chức/nhóm quyền + bảng a_* của SSO (không có country, không có rank_weight).')}\n${tableSql.join('\n')}`,
  );
  fs.writeFileSync(
    path.join(OUT_DIR, '0002_baseline_procs.sql'),
    `${header(`${routineRows.length} proc/function (a_* + CRUD user/tổ chức/nhóm quyền), nguyên văn pg_get_functiondef.`)}\n-- Function LANGUAGE sql kiểm tra thân lúc tạo -> tắt để không phụ thuộc thứ tự tạo.\nSET LOCAL check_function_bodies = false;\n\n${routineSql.join('\n')}`,
  );
  console.log(`OK: ${TABLES.length} bảng, ${routineRows.length} proc -> ${OUT_DIR}`);
}

function header(desc) {
  return [
    '-- Sinh tự động bởi scripts/sso-management/generate-baseline.js từ build_management (26/09/2026).',
    `-- ${desc}`,
    '-- Chạy trên DB sso_management rỗng. Đã commit thì KHÔNG sinh lại đè lên - đổi schema bằng file mới.',
    '',
  ].join('\n');
}

async function tableDdl(client, table) {
  const skip = SKIP_COLUMNS[table] || [];
  const { rows: cols } = await client.query(
    `SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull, a.attidentity,
            pg_get_expr(d.adbin, d.adrelid) AS def
     FROM pg_attribute a
     LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`,
    [`public.${table}`],
  );
  const lines = cols
    .filter((c) => !skip.includes(c.attname))
    .map(
      (c) =>
        `  ${quoteIdent(c.attname)} ${c.type}${identity(c.attidentity)}${c.def ? ` DEFAULT ${c.def}` : ''}${c.attnotnull ? ' NOT NULL' : ''}`,
    );

  const { rows: cons } = await client.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conrelid = $1::regclass AND contype IN ('p','u','f','c')
     ORDER BY CASE contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'c' THEN 2 ELSE 3 END, conname`,
    [`public.${table}`],
  );
  for (const c of cons) {
    lines.push(`  CONSTRAINT ${quoteIdent(c.conname)} ${c.def}`);
  }

  const { rows: idx } = await client.query(
    `SELECT i.indexdef
     FROM pg_indexes i
     WHERE i.schemaname = 'public' AND i.tablename = $1
       AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname = i.indexname)
     ORDER BY i.indexname`,
    [table],
  );

  return [
    `CREATE TABLE IF NOT EXISTS public.${quoteIdent(table)} (`,
    lines.join(',\n'),
    ');',
    ...idx.map((r) => `${r.indexdef.replace(/^CREATE (UNIQUE )?INDEX /, 'CREATE $1INDEX IF NOT EXISTS ')};`),
    '',
  ].join('\n');
}

// branch_id/department_id/position_id là identity (proc Insert* không truyền id).
// copy-data.js đẩy sequence lên sau khi chép dữ liệu.
function identity(kind) {
  if (kind === 'a') return ' GENERATED ALWAYS AS IDENTITY';
  if (kind === 'd') return ' GENERATED BY DEFAULT AS IDENTITY';
  return '';
}

function quoteIdent(name) {
  return /^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
