#!/usr/bin/env node
/**
 * MỘT lệnh kiểm sức khoẻ toàn bộ harness.
 *
 *   node tooling/doctor.mjs            chạy mọi kiểm tra
 *   node tooling/doctor.mjs --quick    bỏ qua phần chậm
 *
 * Đây là điểm vào duy nhất bạn cần nhớ. Nó gọi mọi công cụ khác và tổng hợp
 * thành một bảng có hành động — thay vì bắt bạn nhớ 8 lệnh.
 *
 * Chạy: sau khi áp template · sau khi nâng cấp · mỗi 2 tuần · khi thấy "agent hôm nay lạ".
 */
import { existsSync, readFileSync } from 'node:fs';
import { repoPath, run, config, readJson, git, exists } from './lib/harness.mjs';

const QUICK = process.argv.includes('--quick');
const cfg = config();

const checks = [
  { id: 'hooks',    label: 'Hook tests',              cmd: ['tooling/test-hooks.mjs'],        critical: true },
  { id: 'coverage', label: 'Template coverage',       cmd: ['tooling/apply-to.mjs', '--audit'], critical: false },
  { id: 'know',     label: 'Knowledge lint',          cmd: ['tooling/knowledge/lint.mjs'],    critical: false },
  { id: 'entropy',  label: 'Entropy scan',            cmd: ['tooling/entropy-scan.mjs'],      critical: false },
  { id: 'size',     label: 'Kích thước harness',      cmd: ['tooling/harness-size.mjs'],      critical: false },
  { id: 'feature',  label: 'Feature integrity',       cmd: ['tooling/check-feature-integrity.mjs'], critical: false, slow: true },
  { id: 'evals',    label: 'Eval (liệt kê)',          cmd: ['evals/run.mjs', '--dry'],        critical: false },
];

const results = [];
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  HARNESS DOCTOR                                              ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

for (const c of checks) {
  if (QUICK && c.slow) { results.push({ ...c, status: 'skip' }); continue; }
  if (!exists(repoPath(c.cmd[0]))) { results.push({ ...c, status: 'missing' }); continue; }
  const r = run('node', [repoPath(c.cmd[0]), ...c.cmd.slice(1)]);
  results.push({ ...c, status: r.status === 0 ? 'pass' : 'fail', out: (r.stdout + '\n' + r.stderr).trim() });
}

const ICON = { pass: '  ✓', fail: '  ✗', skip: '  –', missing: '  ?' };
for (const r of results) {
  console.log(`${ICON[r.status]}  ${r.label.padEnd(26)} ${r.status === 'pass' ? '' : r.status.toUpperCase()}`);
}

// ── Cấu hình đã sẵn sàng chưa ────────────────────────────────────────────────
console.log('\n── CẤU HÌNH ──');
const blockers = [], advice = [];

// Repo TEMPLATE thì CHANGEME và commands rỗng là ĐÚNG — đó là placeholder.
// Project THẬT thì cùng trạng thái đó nghĩa là gate không tồn tại.
const IS_TEMPLATE = exists(repoPath('HARNESS-CHANGELOG.md'))
  && exists(repoPath('tooling', 'apply-to.mjs'))
  && !exists(repoPath('.claude', 'harness-manifest.json'));
const blocker = m => (IS_TEMPLATE ? advice : blockers).push(m);

if (IS_TEMPLATE) console.log('  ℹ  Đây là REPO TEMPLATE — placeholder CHANGEME là đúng, không phải lỗi.');

if (String(cfg.project?.id).includes('CHANGEME')) blocker('harness.config.json → project.id vẫn là CHANGEME');
if (String(cfg.project?.dri || '').includes('CHANGEME')) blocker('harness.config.json → project.dri chưa điền');

const cmds = Object.entries(cfg.commands || {}).filter(([, v]) => v && String(v).trim());
if (!cmds.length) {
  blocker('commands rỗng — GATE KHÔNG TỒN TẠI. Harness này đang chỉ là trang trí, và BẠN là verification loop.');
} else {
  console.log(`  ✓  ${cmds.length} lệnh đã khai: ${cmds.map(([k]) => k).join(', ')}`);
  for (const need of ['verify', 'typecheck', 'test']) {
    if (!cfg.commands?.[need]) advice.push(`chưa khai commands.${need} — gate sẽ bỏ qua nó`);
  }
}

const co = readJson(repoPath('.github', 'CODEOWNERS'));
const coText = exists(repoPath('.github', 'CODEOWNERS')) ? readFileSync(repoPath('.github', 'CODEOWNERS'), 'utf8') : '';
if (coText.includes('@dri') || coText.includes('@tech-lead')) {
  blocker('.github/CODEOWNERS còn handle placeholder — GitHub BỎ QUA IM LẶNG handle không tồn tại, bạn tưởng mình được bảo vệ');
}

if (!exists(repoPath('.mcp.json')) && exists(repoPath('.mcp.json.example'))) {
  advice.push('chưa có .mcp.json (có .example) — không sao nếu bạn chưa cần MCP');
}
const mcpCount = Object.keys(readJson(repoPath('.mcp.json'), {})?.mcpServers ?? {}).length;
const mcpMax = cfg.mcp?.maxServers ?? 5;
if (mcpCount > mcpMax) advice.push(`${mcpCount} MCP server (ngưỡng ${mcpMax}) — tool definition ăn context mỗi request`);

if (!cfg.budget?.monthlyUsdCap) advice.push('budget.monthlyUsdCap = 0 — không có cap chi tiêu. Xem docs/ECONOMICS.md');

// ── Git / phối hợp ───────────────────────────────────────────────────────────
console.log('\n── GIT & PHỐI HỢP ──');
const hooksPath = run('git', ['config', 'core.hooksPath']).stdout;
if (hooksPath !== '.githooks') blocker('core.hooksPath chưa trỏ .githooks — pre-commit guard KHÔNG chạy. Sửa: node tooling/init.mjs');
else console.log('  ✓  pre-commit guard đang bật');

for (const [k, want] of [['core.autocrlf', 'false'], ['core.ignorecase', 'false']]) {
  const got = run('git', ['config', k]).stdout;
  if (got !== want) advice.push(`git config ${k} = "${got || 'chưa set'}" (nên là ${want}) — chạy node tooling/init.mjs`);
}

const wt = (git(['worktree', 'list', '--porcelain']).stdout.match(/^worktree /gm) || []).length;
const maxWt = cfg.limits?.maxWorktrees ?? 4;
if (wt - 1 > maxWt) advice.push(`${wt - 1} worktree (trần ${maxWt}) — chạy node tooling/wt-clean.mjs`);

// ── Vòng học có đang chạy không ──────────────────────────────────────────────
console.log('\n── VÒNG HỌC ──');
const fixlogPath = repoPath('.claude', 'telemetry', 'manual-fixes.log');
const fixCount = exists(fixlogPath) ? readFileSync(fixlogPath, 'utf8').split('\n').filter(Boolean).length : 0;
const lessonCount = readJson(repoPath('knowledge', 'index.json'), { count: 0 }).count;
const evalCount = exists(repoPath('evals', 'tasks'))
  ? (await import('node:fs')).readdirSync(repoPath('evals', 'tasks')).filter(f => f.endsWith('.md') && !f.startsWith('_')).length : 0;

console.log(`  fixlog: ${fixCount} mục  ·  bài học: ${lessonCount}  ·  eval task: ${evalCount}`);

if (fixCount === 0) advice.push('fixlog trống — vòng học chưa có nguyên liệu. Đây là việc RẺ NHẤT và GIÁ TRỊ NHẤT: `node tooling/fixlog.mjs "..."` mỗi lần bạn phải sửa tay (3 giây)');
if (evalCount === 0) advice.push('không có eval task — bạn đang TỐI ƯU MÙ: không có cách nào biết một thay đổi harness làm tốt lên hay tệ đi');
if (fixCount >= 10 && lessonCount === 0) advice.push(`${fixCount} lần sửa tay nhưng 0 bài học — chạy /harness-retro`);

// ── Manifest / version ───────────────────────────────────────────────────────
const mf = readJson(repoPath('.claude', 'harness-manifest.json'));
const localVer = exists(repoPath('harness.version')) ? readFileSync(repoPath('harness.version'), 'utf8').trim() : null;
if (mf) console.log(`  harness version: ${mf.templateVersion} (áp ${String(mf.upgradedAt || mf.appliedAt).slice(0, 10)})`);
else if (localVer) console.log(`  harness version: ${localVer} (chưa có manifest — nâng cấp lần tới sẽ không phát hiện được file bạn đã sửa)`);
else advice.push('không có .claude/harness-manifest.json — chạy upgrade.mjs một lần để tạo, nếu không nâng cấp sau này sẽ ghi đè mù');

// ── Tổng kết ─────────────────────────────────────────────────────────────────
const failed = results.filter(r => r.status === 'fail');
console.log('\n╔══════════════════════════════════════════════════════════════╗');
if (blockers.length) {
  console.log('║  CHẶN — sửa trước mọi việc khác                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  for (const b of blockers) console.log(`  ✗  ${b}`);
}
if (failed.length) {
  console.log(`\n  Kiểm tra ĐỎ (${failed.length}) — chạy riêng để xem chi tiết:`);
  for (const f of failed) console.log(`     node ${f.cmd.join(' ')}`);
}
if (advice.length) {
  console.log(`\n  Nên làm (${advice.length}):`);
  for (const a of advice) console.log(`     · ${a}`);
}
if (!blockers.length && !failed.length && !advice.length) {
  console.log('║  Harness khoẻ.                                               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
}
console.log('');

process.exit(blockers.length || failed.some(f => f.critical) ? 1 : 0);
