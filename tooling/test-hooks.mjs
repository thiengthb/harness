#!/usr/bin/env node
/**
 * Test hook như test unit.  ĐÂY LÀ THỨ GẦN NHƯ KHÔNG AI LÀM.
 *
 * Hook là code có quyền chặn công việc của cả team — nhưng hầu như không ai test nó.
 * Bảng case dưới đây mất 30 phút để viết và ngăn được cả một lớp sự cố
 * "hook mới làm cả team đứng".
 *
 * Chạy trong CI trên cả 3 OS (.github/workflows/harness-parity.yml).
 */
import { spawnSync } from 'node:child_process';
import { repoPath, report, exists, git } from './lib/harness.mjs';

const BLOCK = 2, OK = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Dựng một commit "đã merge" TẤT ĐỊNH để test protect-migrations.
//
// Không dùng origin/main: CI clone nông thường không có nó, và test phụ thuộc
// trạng thái remote là test lúc xanh lúc đỏ. Ở đây ta tạo một commit lơ lửng
// (không ref, git gc sẽ dọn) chứa đúng một file db/migrations/0001_init.sql,
// rồi trỏ HARNESS_INTEGRATION_BRANCH vào nó. Không đụng index, không tạo ref.
// ─────────────────────────────────────────────────────────────────────────────
// Identity đặt qua -c: máy CI thường KHÔNG có user.email, và commit-tree sẽ fail.
const ID = ['-c', 'user.name=harness-test', '-c', 'user.email=harness@test.local'];

function mktree(entries) {
  const r = git(['mktree'], { input: entries.map(e => `${e.mode} ${e.type} ${e.sha}\t${e.name}`).join('\n') + '\n' });
  if (r.status !== 0) throw new Error(`git mktree: ${r.stderr}`);
  return r.stdout;
}

let MERGED_REF = null, setupErr = '';
try {
  const blob = git(['hash-object', '-w', '--stdin'], { input: '-- migration đã merge, dùng cho test\n' }).stdout;
  const tMig = mktree([{ mode: '100644', type: 'blob', sha: blob, name: '0001_init.sql' }]);
  const tDb = mktree([{ mode: '040000', type: 'tree', sha: tMig, name: 'migrations' }]);
  const tRoot = mktree([{ mode: '040000', type: 'tree', sha: tDb, name: 'db' }]);
  const c = git([...ID, 'commit-tree', tRoot, '-m', 'fixture: migration da merge']);
  if (c.status !== 0) throw new Error(`git commit-tree: ${c.stderr}`);
  MERGED_REF = c.stdout;
} catch (e) { setupErr = String(e.message || e); }

const cases = [
  // ── DCG ────────────────────────────────────────────────────────────────────
  ['dcg.mjs', { tool_input: { command: 'git push --force origin main' } }, BLOCK, 'force push bị chặn'],
  ['dcg.mjs', { tool_input: { command: 'git push -f' } }, BLOCK, 'force push dạng -f bị chặn'],
  ['dcg.mjs', { tool_input: { command: 'git push --force-with-lease' } }, OK, 'force-with-lease ĐƯỢC PHÉP (biến thể an toàn)'],
  ['dcg.mjs', { tool_input: { command: 'git reset --hard HEAD~1' } }, BLOCK, 'reset --hard bị chặn'],
  ['dcg.mjs', { tool_input: { command: 'git clean -fd' } }, BLOCK, 'git clean -fd bị chặn'],
  ['dcg.mjs', { tool_input: { command: 'rm -rf /' } }, BLOCK, 'rm -rf / bị chặn'],
  ['dcg.mjs', { tool_input: { command: 'rm -rf ./build/tmp' } }, OK, 'rm -rf đường dẫn hẹp được phép'],
  ['dcg.mjs', { tool_input: { command: 'DROP TABLE users;' } }, BLOCK, 'DROP TABLE bị chặn'],
  ['dcg.mjs', { tool_input: { command: 'terraform apply -auto-approve' } }, BLOCK, 'apply không review plan bị chặn'],
  ['dcg.mjs', { tool_input: { command: 'git status && git log --oneline -5' } }, OK, 'lệnh git thường được phép'],

  // ── Secrets ────────────────────────────────────────────────────────────────
  ['block-secrets.mjs', { tool_input: { file_path: '.env' } }, BLOCK, 'ghi .env bị chặn'],
  ['block-secrets.mjs', { tool_input: { file_path: '.env.production' } }, BLOCK, 'ghi .env.* bị chặn'],
  ['block-secrets.mjs', { tool_input: { file_path: 'certs/server.pem' } }, BLOCK, 'ghi .pem bị chặn'],
  ['block-secrets.mjs', { tool_input: { file_path: 'src/a.ts', content: 'const k = "sk-abcdefghijklmnopqrstuvwxyz012345"' } }, BLOCK, 'secret trong nội dung bị chặn'], // harness-allow-secret
  ['block-secrets.mjs', { tool_input: { file_path: 'src/a.ts', content: 'const k = process.env.API_KEY' } }, OK, 'đọc từ env được phép'],
  // `.env.example` PHẢI đi qua: tooling/init.mjs copy nó thành .env, .gitignore whitelist nó, và
  // paths.secrets mặc định phủ định nó bằng `!**/.env.example`. Trước đây case này assert BLOCK và
  // gọi đó là "cố ý" — nhưng nó làm pre-commit chặn commit ĐẦU TIÊN của mọi project mới.
  ['block-secrets.mjs', { tool_input: { file_path: '.env.example' } }, OK, '.env.example được phép (paths.secrets phủ định nó)'],
  ['block-secrets.mjs', { tool_input: { file_path: 'config/.env.example' } }, OK, '.env.example trong thư mục con cũng được phép'],

  // ── Generated ──────────────────────────────────────────────────────────────
  ['block-generated-edit.mjs', { tool_input: { file_path: 'packages/api-client/x.gen.ts' } }, BLOCK, 'sửa .gen.* bị chặn'],
  ['block-generated-edit.mjs', { tool_input: { file_path: 'packages/core/src/a.ts' } }, OK, 'file nguồn được phép'],
  // Case này TRƯỚC ĐÂY khẳng định "sửa migration bị chặn" — SAI, và test đã đóng
  // đinh cái sai đó. Migration hầu hết là viết tay; chặn hết là bắn nhầm hằng ngày.
  // Nay do protect-migrations.mjs lo, và chỉ khi migration ĐÃ MERGE.
  ['block-generated-edit.mjs', { tool_input: { file_path: 'db/migrations/001_init.sql' } }, OK, 'migration KHÔNG phải generated — được sửa'],

  // ── Migration đã merge ─────────────────────────────────────────────────────
  ['protect-migrations.mjs', { tool_input: { file_path: 'packages/core/src/a.ts' } }, OK, 'file thường không liên quan'],
  ['protect-migrations.mjs', { tool_input: { file_path: 'db/migrations/999_moi_toanh.sql' } }, OK, 'migration MỚI luôn được phép'],
  ['protect-migrations.mjs', { tool_input: { file_path: 'db/migrations/0001_init.sql' } }, BLOCK, 'migration ĐÃ MERGE bị chặn', { HARNESS_INTEGRATION_BRANCH: () => MERGED_REF }],
  ['protect-migrations.mjs', { tool_input: { file_path: 'db/migrations/0001_init.sql' } }, OK, 'cửa thoát HARNESS_ALLOW_MIGRATION_EDIT mở được', { HARNESS_INTEGRATION_BRANCH: () => MERGED_REF, HARNESS_ALLOW_MIGRATION_EDIT: '1' }],
  ['protect-migrations.mjs', { tool_input: { file_path: 'db/migrations/0001_init.sql' } }, OK, 'nhánh tích hợp không resolve được → FAIL OPEN, không chặn', { HARNESS_INTEGRATION_BRANCH: 'nhanh-khong-ton-tai-2f9a' }],
  ['protect-migrations.mjs', { tool_input: null }, OK, 'input rác không làm crash'],

  // ── Harness ────────────────────────────────────────────────────────────────
  ['protect-harness.mjs', { tool_input: { file_path: '.claude/settings.json' } }, BLOCK, 'agent không tự sửa settings.json'],
  ['protect-harness.mjs', { tool_input: { file_path: '.claude/hooks/dcg.mjs' } }, BLOCK, 'agent không tự sửa hook'],
  ['protect-harness.mjs', { tool_input: { file_path: 'AGENTS.md' } }, BLOCK, 'agent không tự sửa AGENTS.md'],
  ['protect-harness.mjs', { tool_input: { file_path: 'harness.config.json' } }, BLOCK, 'agent không tự sửa config'],
  ['protect-harness.mjs', { tool_input: { file_path: '.claude/learnings/2026-W31-ai.md' } }, OK, 'ĐỀ XUẤT được phép — đây là đường hợp pháp'],
  ['protect-harness.mjs', { tool_input: { file_path: 'docs/progress/ABC-1.md' } }, OK, 'nhật ký được phép'],
  ['protect-harness.mjs', { tool_input: { file_path: 'src/index.ts' } }, OK, 'code thường được phép'],

  // ── Feature files ──────────────────────────────────────────────────────────
  ['protect-feature-files.mjs', { tool_input: { file_path: 'features/_index.json' } }, BLOCK, '_index.json do DRI quản'],
  ['protect-feature-files.mjs', { tool_input: { file_path: 'src/index.ts' } }, OK, 'ngoài features/ không đụng tới'],

  // ── Bảo vệ test (fixture: tooling/fixtures/example.test.js — 2 block, 3 assert) ──
  ['protect-tests.mjs',
    { tool_input: { file_path: 'tooling/fixtures/example.test.js', content: 'it("một", () => { expect(1).toBe(1); });' } },
    BLOCK, 'thu nhỏ test bị chặn (sửa test cho pass thay vì sửa code)'],
  ['protect-tests.mjs',
    { tool_input: { file_path: 'tooling/fixtures/example.test.js', content: 'describe("x",()=>{it("a",()=>{expect(1).toBe(1);expect(2).toBe(2);});it("b",()=>{expect(3).toBe(3);});it("c",()=>{expect(4).toBe(4);});});' } },
    OK, 'THÊM test luôn được phép'],
  ['protect-tests.mjs',
    { tool_input: { file_path: 'tooling/fixtures/example.test.js', content: '// harness-allow-test-shrink — test đã lỗi thời\nit("một", () => { expect(1).toBe(1); });' } },
    OK, 'thu nhỏ CÓ CHỦ Ý được phép qua marker'],
  ['protect-tests.mjs',
    { tool_input: { file_path: 'src/a.ts', content: 'export const x = 1' } },
    OK, 'file không phải test thì bỏ qua'],
  ['protect-tests.mjs',
    { tool_input: { file_path: 'tooling/fixtures/khong-ton-tai.test.js', content: 'it("a",()=>{});' } },
    OK, 'file test MỚI luôn được phép'],

  // ── Hook KHÔNG chặn: phải chạy sạch, không bao giờ crash ───────────────────
  // Một hook crash sẽ chặn MỌI THỨ. Đây là test rẻ nhất và quan trọng nhất cho chúng.
  ['session-start.mjs', {}, OK, 'chạy được với input rỗng'],
  ['session-start.mjs', { source: 'startup' }, OK, 'chạy được với input thật'],
  // Hai case dưới assert LOGIC "lệnh chưa khai → bỏ qua", nên chúng phải chạy trên một config DỰNG
  // SẴN (fixtures/config-unconfigured.json), không phải trên config thật của project. Bám vào config
  // thật thì điền `commands` — việc SỐ 1 khi áp template — sẽ làm chính test suite này đỏ.
  ['stop-gate.mjs', {}, OK, 'gate chưa cấu hình lệnh → bỏ qua, KHÔNG fail', { HARNESS_CONFIG: () => repoPath('tooling', 'fixtures', 'config-unconfigured.json') }],
  ['post-edit-lint.mjs', { tool_input: { file_path: 'a.ts' } }, OK, 'lintFix chưa khai → bỏ qua', { HARNESS_CONFIG: () => repoPath('tooling', 'fixtures', 'config-unconfigured.json') }],
  ['post-edit-lint.mjs', { tool_input: { file_path: 'assets/logo.png' } }, OK, 'file không lint được → bỏ qua'],
  ['post-edit-lint.mjs', { tool_input: { file_path: 'packages/x/y.gen.ts' } }, OK, 'file generated → bỏ qua'],
  ['post-edit-lint.mjs', {}, OK, 'không có file_path → bỏ qua'],

  // Mọi hook phải sống sót với input rác — agent/harness có thể gửi bất cứ thứ gì
  ['dcg.mjs', { tool_input: null }, OK, 'input rác không làm crash'],
  ['block-secrets.mjs', { tool_input: { file_path: null } }, OK, 'input rác không làm crash'],
  ['block-generated-edit.mjs', {}, OK, 'input rỗng không làm crash'],
  ['protect-harness.mjs', { tool_input: {} }, OK, 'input rỗng không làm crash'],
  ['protect-feature-files.mjs', { tool_input: { file_path: '' } }, OK, 'path rỗng không làm crash'],
  ['protect-tests.mjs', { tool_input: null }, OK, 'input rác không làm crash'],
];

const ok = [], fail = [];

// Setup hỏng = KHÔNG chạy được case "đã merge". Báo ĐỎ, không im lặng bỏ qua —
// một test bị skip âm thầm đọc y hệt một test đang xanh.
if (!MERGED_REF) fail.push(`SETUP: không dựng được commit fixture cho protect-migrations — ${setupErr || 'không rõ lý do'}`);

for (const [hook, input, expect, label, env] of cases) {
  const path = repoPath('.claude', 'hooks', hook);
  if (!exists(path)) { fail.push(`${hook}: KHÔNG TỒN TẠI`); continue; }

  // Giá trị env có thể là hàm — lười tính, vì fixture chỉ có sau bước setup.
  const extra = Object.fromEntries(
    Object.entries(env || {}).map(([k, v]) => [k, String(typeof v === 'function' ? v() : v)]),
  );

  const r = spawnSync(process.execPath, [path], {
    input: JSON.stringify(input), encoding: 'utf8', cwd: repoPath(''),
    env: { ...process.env, ...extra },
  });
  const status = r.status ?? -1;
  if (status === expect) ok.push(`${hook.padEnd(28)} ${label}`);
  else fail.push(`${hook.padEnd(28)} ${label}  →  exit=${status}, mong đợi ${expect}${r.stderr ? `\n         stderr: ${r.stderr.split('\n')[0]}` : ''}`);
}

console.log(`\n=== HOOK TESTS (${ok.length}/${cases.length} pass) ===`);
for (const m of ok) console.log('  PASS  ' + m);
for (const m of fail) console.log('  FAIL  ' + m);
console.log('');

process.exit(fail.length ? 1 : 0);
