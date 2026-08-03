#!/usr/bin/env node
/**
 * Áp template harness này lên một project khác.
 *
 *   node tooling/apply-to.mjs /đường/dẫn/project        # xem trước
 *   node tooling/apply-to.mjs /đường/dẫn/project --apply
 *   node tooling/apply-to.mjs /đường/dẫn/project --apply --update   # chỉ cập nhật lớp harness
 *
 * MẶC ĐỊNH KHÔNG GHI ĐÈ file đã tồn tại. Với --update, chỉ ghi đè những file
 * thuần-harness (hook, tooling, lib) chứ không đụng vào nội dung của project
 * (AGENTS.md, harness.config.json, features/, docs/, knowledge/lessons/).
 */
import { readdirSync, statSync, mkdirSync, cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, relative, sep } from 'node:path';
import { REPO_ROOT, report } from './lib/harness.mjs';

const args = process.argv.slice(2);
const target = args.find(a => !a.startsWith('--'));
const APPLY = args.includes('--apply');
const UPDATE = args.includes('--update');
const AUDIT = args.includes('--audit');

if (!target && !AUDIT) {
  console.error(`Cách dùng:
  node tooling/apply-to.mjs <thư-mục-project>            xem trước
  node tooling/apply-to.mjs <thư-mục-project> --apply
  node tooling/apply-to.mjs <thư-mục-project> --apply --update   cập nhật lớp harness
  node tooling/apply-to.mjs --audit                     kiểm danh sách có bỏ sót file nào không`);
  process.exit(1);
}

const DEST = target ? resolve(target) : null;
if (!AUDIT) {
  if (!existsSync(DEST)) { console.error(`Không tồn tại: ${DEST}`); process.exit(1); }
  if (DEST === REPO_ROOT) { console.error('Đích trùng nguồn.'); process.exit(1); }
}

// ── Phân loại ────────────────────────────────────────────────────────────────
// HARNESS = cơ chế thuần, cập nhật được  ·  SEED = nội dung project, chỉ tạo một lần
const HARNESS = [
  '.claude/hooks', '.claude/skills', '.claude/agents',
  'tooling/lib', 'tooling/knowledge', 'tooling/fixtures',
  'tooling/init.mjs', 'tooling/test-hooks.mjs', 'tooling/apply-to.mjs',
  'tooling/fixlog.mjs', 'tooling/coactivity.mjs', 'tooling/harness-size.mjs',
  'tooling/capo-report.mjs', 'tooling/doctor.mjs', 'tooling/entropy-scan.mjs',
  'tooling/upgrade.mjs',
  'tooling/check-reservations.mjs', 'tooling/check-feature-integrity.mjs',
  'tooling/wt-clean.mjs', 'tooling/statusline.mjs', 'tooling/precommit-scan.mjs',
  '.githooks', 'evals/run.mjs',
  'harness.version', 'HARNESS-CHANGELOG.md', 'harness-migrations',
];
const SEED = [
  'AGENTS.md', 'CLAUDE.md', 'harness.config.json',
  '.gitattributes', '.gitignore', '.gitmessage',
  '.claude/settings.json', '.claude/settings.local.example.json', '.claude/whats-new.md',
  '.claude/rules', '.claude/learnings/_TEMPLATE.md',
  '.mcp.json.example',
  'knowledge/README.md', 'knowledge/lessons/_TEMPLATE.md',
  'knowledge/lessons/0001-lockfile-merge-tay.md', 'knowledge/lessons/0002-guard-ban-nham.md',
  'features/_index.json', 'features/_TEMPLATE.json',
  'docs/CONFLICTS.md', 'docs/WIP.md', 'docs/BRANCH-PROTECTION.md',
  'docs/DOR-DOD.md', 'docs/onboarding.md', 'docs/ROADMAP-30D.md',
  'docs/ANTI-PATTERNS.md', 'docs/ARCHITECTURE.md', 'docs/ECONOMICS.md',
  'docs/MULTI-PROJECT.md', 'docs/RECOVERY.md', 'docs/TEAM.md', 'docs/DESIGN.md',
  'docs/adr/_TEMPLATE.md', 'docs/adr/0001-harness-baseline.md',
  'docs/progress/_TEMPLATE.md', 'docs/progress/_TEAM.md',
  'docs/rubrics/_TEMPLATE.md', 'docs/specs/_TEMPLATE.md', 'docs/runbooks/README.md',
  'tooling/generators/README.md',
  'evals/README.md', 'evals/tasks/_TEMPLATE.md',
  'evals/tasks/0001-harness-tu-kiem.md', 'evals/tasks/0002-ton-trong-guardrail.md',
  'evals/tasks/0003-khong-tu-khen.md', 'evals/tasks/0004-khong-merge-tay-lockfile.md',
  'docs/MIGRATION.md',
  'reservations/README.md',
  '.github/CODEOWNERS', '.github/pull_request_template.md',
  '.github/workflows/harness-parity.yml', '.github/workflows/ci.yml',
];

function filesUnder(rel) {
  const abs = join(REPO_ROOT, rel);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [rel];
  const out = [];
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    out.push(...filesUnder(join(rel, e.name).split(sep).join('/')));
  }
  return out;
}

// ── --audit: bắt file bị bỏ sót khỏi hai danh sách trên ─────────────────────
// Lớp bug này im lặng: thêm một file, quên cập nhật danh sách, và template ship
// thiếu mà không ai biết cho tới khi một project mới thiếu mất một hook.
// Chạy trong CI (harness-parity.yml).
if (AUDIT) {
  const covered = new Set([...HARNESS, ...SEED].flatMap(filesUnder));
  // Cố ý không mang đi: nội dung riêng của repo này, artifact sinh ra, hoặc file gốc
  const IGNORE = [
    /^\.git\//, /^node_modules\//, /^\.harness-pack\//, /^knowledge\/incoming\//,
    /^\.claude\/(telemetry|state)\//, /^\.vscode\//,
    /^README\.md$/,                                   // README của chính template
    /^knowledge\/index\.json$/,                       // sinh tự động
    /^features\/example-feature\.json$/,              // ví dụ, không seed
    /^docs\/progress\/[A-Z]/,                         // nhật ký issue thật
    /^\.claude\/learnings\/(?!_TEMPLATE)/,            // learnings thật
    // KHÔNG ignore evals/tasks/ — trong repo TEMPLATE, mọi eval task là nội dung
    // phải ship. Bỏ qua cả nhóm che đúng lớp bug này: thêm task seed, quên đưa vào
    // SEED, project nhận bài học trỏ vào eval không tồn tại và `lint` đỏ ngay.
    // (Gặp thật ở v1.4.0 với evals/tasks/0004.)
    /^knowledge\/incoming\//,                         // pack nạp về, không ship
    /^reservations\/.*\.json$/,
    /^\.claude\/settings\.local\.json$/, /^\.env/,
  ];
  const all = filesUnder('.').filter(f => !IGNORE.some(re => re.test(f)));
  const missing = all.filter(f => !covered.has(f));
  if (missing.length) {
    console.error(`\n⛔ ${missing.length} file KHÔNG nằm trong HARNESS hoặc SEED — sẽ không được copy sang project mới:\n`);
    for (const m of missing) console.error('   ' + m);
    console.error('\nThêm vào danh sách trong tooling/apply-to.mjs, hoặc vào IGNORE nếu cố ý không mang đi.\n');
    process.exit(1);
  }
  console.log(`\n✓ AUDIT: ${covered.size} file được phủ, không bỏ sót.\n`);
  process.exit(0);
}

const plan = [];
for (const [group, list] of [['harness', HARNESS], ['seed', SEED]]) {
  for (const rel of list) {
    for (const f of filesUnder(rel)) {
      const destPath = join(DEST, f);
      const exists = existsSync(destPath);
      const overwrite = exists && group === 'harness' && UPDATE;
      plan.push({ f, group, action: exists ? (overwrite ? 'update' : 'skip') : 'create' });
    }
  }
}

const created = plan.filter(p => p.action === 'create');
const updated = plan.filter(p => p.action === 'update');
const skipped = plan.filter(p => p.action === 'skip');

console.log(`\n=== ÁP HARNESS → ${DEST} ===`);
console.log(`  tạo mới:   ${created.length}`);
console.log(`  cập nhật:  ${updated.length}${UPDATE ? '' : '  (dùng --update để cập nhật lớp harness)'}`);
console.log(`  bỏ qua:    ${skipped.length}  (đã tồn tại)`);

if (!APPLY) {
  console.log('\n  Xem trước. Thêm --apply để thực hiện.\n');
  for (const p of [...created, ...updated].slice(0, 40)) console.log(`    ${p.action.padEnd(7)} ${p.f}`);
  if (created.length + updated.length > 40) console.log(`    … và ${created.length + updated.length - 40} file nữa`);
  console.log('');
  process.exit(0);
}

for (const p of [...created, ...updated]) {
  const src = join(REPO_ROOT, p.f);
  const dst = join(DEST, p.f);
  mkdirSync(join(dst, '..'), { recursive: true });
  cpSync(src, dst);
}

// Tạo thư mục rỗng cần thiết
for (const d of ['.claude/learnings', 'knowledge/lessons', 'reservations', 'docs/progress', 'evals/tasks']) {
  mkdirSync(join(DEST, d), { recursive: true });
}

// ── Ghi manifest — điều kiện để nâng cấp sau này KHÔNG ghi đè mù ─────────────
// Không có nó, upgrade.mjs không phân biệt được "project đã sửa file này" với
// "template đã đổi file này", và phải chọn một trong hai cách tệ: ghi đè mù,
// hoặc không nâng cấp gì cả.
const version = existsSync(join(REPO_ROOT, 'harness.version'))
  ? readFileSync(join(REPO_ROOT, 'harness.version'), 'utf8').trim() : '0.0.0';
const hashes = {};
for (const rel of HARNESS) {
  for (const f of filesUnder(rel)) {
    try { hashes[f] = createHash('sha256').update(readFileSync(join(DEST, f))).digest('hex').slice(0, 16); } catch {}
  }
}
const manifestPath = join(DEST, '.claude', 'harness-manifest.json');
mkdirSync(join(manifestPath, '..'), { recursive: true });
writeFileSync(manifestPath, JSON.stringify({
  templateVersion: version,
  appliedAt: new Date().toISOString(),
  source: REPO_ROOT,
  files: hashes,
}, null, 2) + '\n', 'utf8');

// Nhắc chỉnh những chỗ CHANGEME
const todos = [];
for (const p of created) {
  if (p.group !== 'seed') continue;   // tooling/ chỉ nhắc tới CHANGEME trong thông báo
  const dst = join(DEST, p.f);
  try {
    if (readFileSync(dst, 'utf8').includes('CHANGEME')) todos.push(p.f);
  } catch {}
}

const ok = [`${created.length} file tạo mới`, ...(updated.length ? [`${updated.length} file cập nhật`] : [])];
const warn = todos.length ? [`${todos.length} file còn CHANGEME:`, ...todos.map(t => '   ' + t)] : [];

report('ÁP HARNESS', { ok, warn });

console.log(`  Bước tiếp theo trong ${DEST}:

    1. $EDITOR harness.config.json     ← project.id, dri, và commands.*  ★ VIỆC SỐ 1
    2. node tooling/init.mjs
    3. $EDITOR AGENTS.md               ← chỉ 3 mục: Project · Lệnh · Gotchas
    4. $EDITOR .github/CODEOWNERS      ← handle thật
    5. Bật merge queue + branch protection (docs/BRANCH-PROTECTION.md)

  Không có commands.verify thì gate không tồn tại và harness này chỉ là trang trí.

  Nạp trí tuệ từ repo cũ:
    node tooling/knowledge/import.mjs <đường-dẫn>/.harness-pack
`);
