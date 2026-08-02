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
import { join, resolve, relative, sep } from 'node:path';
import { REPO_ROOT, report } from './lib/harness.mjs';

const args = process.argv.slice(2);
const target = args.find(a => !a.startsWith('--'));
const APPLY = args.includes('--apply');
const UPDATE = args.includes('--update');

if (!target) {
  console.error(`Cách dùng:
  node tooling/apply-to.mjs <thư-mục-project>            xem trước
  node tooling/apply-to.mjs <thư-mục-project> --apply
  node tooling/apply-to.mjs <thư-mục-project> --apply --update   cập nhật lớp harness`);
  process.exit(1);
}

const DEST = resolve(target);
if (!existsSync(DEST)) { console.error(`Không tồn tại: ${DEST}`); process.exit(1); }
if (DEST === REPO_ROOT) { console.error('Đích trùng nguồn.'); process.exit(1); }

// ── Phân loại ────────────────────────────────────────────────────────────────
// HARNESS = cơ chế thuần, cập nhật được  ·  SEED = nội dung project, chỉ tạo một lần
const HARNESS = [
  '.claude/hooks', '.claude/skills', '.claude/agents',
  'tooling/lib', 'tooling/knowledge',
  'tooling/init.mjs', 'tooling/test-hooks.mjs', 'tooling/apply-to.mjs',
  'tooling/fixlog.mjs', 'tooling/coactivity.mjs', 'tooling/harness-size.mjs',
  'tooling/check-reservations.mjs', 'tooling/check-feature-integrity.mjs',
  'tooling/wt-clean.mjs', 'tooling/statusline.mjs', 'tooling/precommit-scan.mjs',
  '.githooks', 'evals/run.mjs',
];
const SEED = [
  'AGENTS.md', 'CLAUDE.md', 'harness.config.json',
  '.gitattributes', '.gitignore', '.gitmessage',
  '.claude/settings.json', '.claude/settings.local.example.json', '.claude/whats-new.md',
  '.claude/rules', '.claude/learnings/_TEMPLATE.md',
  'knowledge/README.md', 'knowledge/lessons/_TEMPLATE.md', 'knowledge/lessons/0001-lockfile-merge-tay.md',
  'features/_index.json', 'features/_TEMPLATE.json',
  'docs/CONFLICTS.md', 'docs/WIP.md', 'docs/BRANCH-PROTECTION.md',
  'docs/DOR-DOD.md', 'docs/onboarding.md',
  'docs/adr/_TEMPLATE.md', 'docs/adr/0001-harness-baseline.md',
  'docs/progress/_TEMPLATE.md', 'docs/progress/_TEAM.md',
  'evals/README.md', 'evals/tasks/_TEMPLATE.md',
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
