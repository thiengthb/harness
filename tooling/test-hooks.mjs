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
import { repoPath, report, exists } from './lib/harness.mjs';

const BLOCK = 2, OK = 0;

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
  ['block-secrets.mjs', { tool_input: { file_path: '.env.example' } }, BLOCK, '.env.example cũng khớp .env.* — CỐ Ý, sửa paths.secrets nếu muốn khác'],

  // ── Generated ──────────────────────────────────────────────────────────────
  ['block-generated-edit.mjs', { tool_input: { file_path: 'packages/api-client/x.gen.ts' } }, BLOCK, 'sửa .gen.* bị chặn'],
  ['block-generated-edit.mjs', { tool_input: { file_path: 'db/migrations/001_init.sql' } }, BLOCK, 'sửa migration bị chặn'],
  ['block-generated-edit.mjs', { tool_input: { file_path: 'packages/core/src/a.ts' } }, OK, 'file nguồn được phép'],

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
  ['stop-gate.mjs', {}, OK, 'gate chưa cấu hình lệnh → bỏ qua, KHÔNG fail'],
  ['post-edit-lint.mjs', { tool_input: { file_path: 'src/a.ts' } }, OK, 'lintFix chưa khai → bỏ qua'],
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

for (const [hook, input, expect, label] of cases) {
  const path = repoPath('.claude', 'hooks', hook);
  if (!exists(path)) { fail.push(`${hook}: KHÔNG TỒN TẠI`); continue; }

  const r = spawnSync(process.execPath, [path], {
    input: JSON.stringify(input), encoding: 'utf8', cwd: repoPath(''),
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
