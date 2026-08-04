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

const incDir = repoPath("knowledge", "incoming");
const pending = exists(incDir)
  ? (await import("node:fs")).readdirSync(incDir).filter(d => exists(repoPath("knowledge","incoming",d,"lessons"))).length : 0;

console.log(`  fixlog: ${fixCount} mục  ·  bài học: ${lessonCount}  ·  eval task: ${evalCount}  ·  pack chờ duyệt: ${pending}`);
if (pending) advice.push(`${pending} pack chờ duyệt ở knowledge/incoming/ — quyết đi: node tooling/knowledge/accept.mjs --list`);

if (fixCount === 0) advice.push('fixlog trống — vòng học chưa có nguyên liệu. Đây là việc RẺ NHẤT và GIÁ TRỊ NHẤT: `node tooling/fixlog.mjs "..."` mỗi lần bạn phải sửa tay (3 giây)');
if (evalCount === 0) advice.push('không có eval task — bạn đang TỐI ƯU MÙ: không có cách nào biết một thay đổi harness làm tốt lên hay tệ đi');
if (fixCount >= 10 && lessonCount === 0) advice.push(`${fixCount} lần sửa tay nhưng 0 bài học — chạy /harness-retro`);

// ── Manifest / version ───────────────────────────────────────────────────────
const mf = readJson(repoPath('.claude', 'harness-manifest.json'));
const localVer = exists(repoPath('harness.version')) ? readFileSync(repoPath('harness.version'), 'utf8').trim() : null;
if (mf) console.log(`  harness version: ${mf.templateVersion} (áp ${String(mf.upgradedAt || mf.appliedAt).slice(0, 10)})`);
else if (localVer) console.log(`  harness version: ${localVer} (chưa có manifest — nâng cấp lần tới sẽ không phát hiện được file bạn đã sửa)`);
else advice.push('không có .claude/harness-manifest.json — chạy upgrade.mjs một lần để tạo, nếu không nâng cấp sau này sẽ ghi đè mù');

// ── Bề mặt vendor: frontmatter skill + rule ──────────────────────────────────
//
// VÌ SAO CHECK NÀY BÁO CÁO CHỨ KHÔNG FAIL: doctor có caller phụ thuộc exit 0,
// và một field lạ là ĐỀ XUẤT xem lại, không phải phán quyết.
//
// GIỮ NGÀY TRÊN DANH SÁCH. Vendor thêm field liên tục; một allowlist không ngày
// sẽ báo một field ĐANG CHẠY là inert — đó là hướng sai làm người ta bỏ qua check.
// Fetch từ code.claude.com/docs/en/skills — 2026-08-04.
const KNOWN_SKILL_KEYS = new Set([
  'name', 'description', 'argument-hint', 'arguments', 'disable-model-invocation',
  'user-invocable', 'allowed-tools', 'disallowed-tools', 'model', 'effort',
  'context', 'agent', 'background', 'hooks', 'paths', 'shell',
]);
// Claude Code CHỈ đọc `paths` trong .claude/rules/*.md. Năm trường còn lại là đầu
// vào cho entropy-scan.mjs — hợp lệ, có người đọc thật, nhưng KHÔNG được vendor
// cưỡng chế. Gọi đúng tên để repo thứ N không tưởng chúng là cấu hình.
const CC_RULE_KEYS = new Set(['paths']);
const HARNESS_RULE_KEYS = new Set(['owner', 'added', 'expires-review', 'why', 'exit-condition']);

console.log('\n── BỀ MẶT VENDOR ──');
const { readdirSync } = await import('node:fs');
const fmKeys = (txt) => {
  const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/);          // CHỈ khối frontmatter,
  if (!m) return [];                                            // không phải cả file —
  return [...m[1].matchAll(/^([A-Za-z][\w-]*):/gm)].map(x => x[1]); // văn xuôi NHẮC tới một
};                                                               // key không phải là KHAI nó.

let skillTotal = 0, discoverable = 0, grantsWrite = [];
const unknownKeys = [];
const skillsDir = repoPath('.claude', 'skills');
if (exists(skillsDir)) {
  for (const name of readdirSync(skillsDir)) {
    const f = repoPath('.claude', 'skills', name, 'SKILL.md');
    if (!exists(f)) continue;
    skillTotal++;
    const txt = readFileSync(f, 'utf8');
    const keys = fmKeys(txt);
    const fm = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
    if (!/^disable-model-invocation:\s*true/m.test(fm)) discoverable++;
    // allowed-tools CẤP quyền (dùng không cần hỏi). Trường HẠN CHẾ là disallowed-tools.
    // Thân skill nói "không ra thay đổi" mà frontmatter tiền-duyệt Write = mâu thuẫn.
    if (/^allowed-tools:.*\b(Write|Edit)\b/m.test(fm)
        && /không ra thay đổi|KHÔNG tự sửa|chỉ đọc|DỪNG, báo cáo/i.test(txt)) grantsWrite.push(name);
    for (const k of keys) if (!KNOWN_SKILL_KEYS.has(k)) unknownKeys.push(`skill/${name}: ${k}`);
  }
}
const skillCap = cfg.limits?.maxSkills ?? 12;
console.log(`  skill: ${skillTotal} tổng · ${discoverable} model tự gọi được (trần ${skillCap})`);
if (discoverable > skillCap) advice.push(`${discoverable} skill trong tầng discovery (trần ${skillCap}) — mỗi cái trả tiền thuê \`description\` MỌI phiên. Thêm \`disable-model-invocation: true\` cho skill nghi thức: chi phí context về 0, không mất chức năng`);
for (const g of grantsWrite) advice.push(`skill \`${g}\`: thân nói KHÔNG ra thay đổi nhưng \`allowed-tools\` tiền-duyệt Write/Edit. Trường HẠN CHẾ là \`disallowed-tools\` — đây là template, nó DẠY thói quen cho mọi repo nhận nó`);

const rulesDir = repoPath('.claude', 'rules');
let rulesNoPaths = 0;
if (exists(rulesDir)) {
  for (const name of readdirSync(rulesDir).filter(f => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md')) {
    const keys = fmKeys(readFileSync(repoPath('.claude', 'rules', name), 'utf8'));
    if (!keys.includes('paths')) rulesNoPaths++;
    for (const k of keys) if (!CC_RULE_KEYS.has(k) && !HARNESS_RULE_KEYS.has(k)) unknownKeys.push(`rule/${name}: ${k}`);
  }
  console.log(`  rule: ${readdirSync(rulesDir).filter(f => f.endsWith('.md')).length} file · ${rulesNoPaths} không có \`paths\` (nạp cho MỌI request)`);
  if (rulesNoPaths > 3) advice.push(`${rulesNoPaths} rule không có \`paths\` — mỗi cái là thuế context cho mọi người ở mọi request. Trần hợp lý: 3–5 rule an toàn toàn cục`);
}
for (const u of unknownKeys) advice.push(`frontmatter key lạ — ${u} (allowlist cập nhật 2026-08-04; nếu vendor vừa thêm field này thì cập nhật allowlist trong doctor, đừng bỏ qua check)`);

// ── Danh mục công cụ: SINH, không gõ tay ─────────────────────────────────────
//
// Mọi thứ máy biết được thì sinh ra. Một bảng hook viết tay trong README lệch
// khỏi thực tế mà không ai thấy — và hai trong ba dòng thiếu thường là loại
// CHẶN được lệnh ghi file.
console.log('\n── DANH MỤC HOOK ──');
const settings = readJson(repoPath('.claude', 'settings.json'), {});
const wired = new Map();                                  // file → [event…]
for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
  for (const g of groups ?? []) for (const h of g.hooks ?? []) {
    const m = String(h.command ?? '').match(/hooks[\/\\]([\w.-]+\.mjs)/);
    if (m) wired.set(m[1], [...(wired.get(m[1]) ?? []), event]);
  }
}
const applyTo = exists(repoPath('tooling', 'apply-to.mjs')) ? readFileSync(repoPath('tooling', 'apply-to.mjs'), 'utf8') : '';
// Khớp cả '.claude/hooks' (thư mục) lẫn '.claude/hooks/x.mjs' (file lẻ). Bản đầu
// của check này đòi dấu `/` cuối và cho DƯƠNG TÍNH GIẢ ngay lần chạy đầu tiên:
// PHẠM VI của check sai, không phải logic của nó — đúng chỗ cần nhìn trước tiên.
const carriesHooks = /['"]\.claude\/hooks(['"/])/.test(applyTo);
const onDisk = exists(repoPath('.claude', 'hooks'))
  ? readdirSync(repoPath('.claude', 'hooks')).filter(f => f.endsWith('.mjs')) : [];
for (const f of onDisk) {
  const events = wired.get(f);
  const src = readFileSync(repoPath('.claude', 'hooks', f), 'utf8');
  const canBlock = /\bblock\(|EXIT_BLOCK|exit\(2\)/.test(src);
  // `fired` của một hook KHÔNG có đường exit 2 là `n/a`, không phải `0`.
  // Gộp hai giá trị đó là cách một bảng nói "cái gác này vô dụng" về một cái gác đang làm việc.
  console.log(`  ${events ? '✓' : '✗'} ${f.padEnd(28)} ${events ? events.join(',') : 'KHÔNG CẮM'}   ${canBlock ? 'chặn được' : 'chỉ nhắc (n/a, không phải 0)'}`);
  if (!events) advice.push(`hook \`${f}\` có trên đĩa nhưng KHÔNG có trong settings.json — mã chết trông như đang sống`);
}
if (!carriesHooks && onDisk.length) advice.push('apply-to.mjs không mang `.claude/hooks/` — repo tiêu thụ sẽ nhận settings.json trỏ vào file không tồn tại');

// Deny rule là lớp 2 cho hai hook glob-tĩnh. Deny rule KHÔNG test được bằng spawn hook,
// nên chỗ nó được kiểm là ĐÂY — nếu không, xoá nó đi cũng không ai biết.
const deny = settings.permissions?.deny ?? [];
const WANT_DENY = ['Edit(**/*.gen.*)', 'Edit(/features/_index.json)'];
for (const d of WANT_DENY) if (!deny.includes(d)) advice.push(`thiếu deny rule \`${d}\` — hook tương ứng chỉ khớp Write|Edit, deny rule phủ thêm \`sed -i\`/\`cat >\` trong Bash và hợp nhất vào ranh giới sandbox`);
for (const d of deny) if (/^(Write|NotebookEdit|Glob|MultiEdit)\(/.test(d)) advice.push(`deny rule \`${d}\` KHÔNG BAO GIỜ được tra cứu — Claude Code chỉ kiểm file theo \`Edit(path)\` và \`Read(path)\`. Đổi thành \`Edit(...)\``);

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
