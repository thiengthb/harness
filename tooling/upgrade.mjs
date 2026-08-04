#!/usr/bin/env node
/**
 * Nâng cấp lớp harness của project này lên version mới của template.
 *
 *   node tooling/upgrade.mjs <đường-dẫn-template>            xem trước (mặc định)
 *   node tooling/upgrade.mjs <đường-dẫn-template> --apply
 *   node tooling/upgrade.mjs <đường-dẫn-template> --apply --force-overwrite
 *
 * VẤN ĐỀ NÀY GIẢI QUYẾT: `apply-to.mjs --update` ghi đè MÙ. Nếu project đã sửa
 * một hook, thay đổi đó biến mất không một lời cảnh báo.
 *
 * Cơ chế: `.claude/harness-manifest.json` lưu hash của mọi file lúc áp/nâng cấp.
 * So ba chiều:
 *
 *   hash hiện tại == hash trong manifest  → project CHƯA sửa  → ghi đè an toàn
 *   hash hiện tại != hash trong manifest  → project ĐÃ sửa    → GIỮ NGUYÊN, ghi ra .new
 *   file không tồn tại                    → file mới          → thêm
 *
 * Và chạy các script trong migrations/ cho khoảng version — đây là chỗ xử lý
 * những thứ mà copy file không làm được (đổi tên field trong config, chuyển
 * cấu trúc thư mục).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, sep, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, repoPath, readJson, writeJson, report, run } from './lib/harness.mjs';

const args = process.argv.slice(2);
const src = args.find(a => !a.startsWith('--'));
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force-overwrite');

if (!src) {
  console.error(`Cách dùng:
  node tooling/upgrade.mjs <đường-dẫn-template>            xem trước
  node tooling/upgrade.mjs <đường-dẫn-template> --apply

Template có thể là thư mục local hoặc một checkout của repo harness.
LUÔN xem trước rồi mới --apply.`);
  process.exit(1);
}

const TPL = resolve(src);
if (!existsSync(join(TPL, 'harness.version'))) {
  console.error(`Không phải thư mục template harness: ${TPL}\n(thiếu harness.version)`);
  process.exit(1);
}

const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16);
const semver = v => String(v).split('.').map(Number);
const cmpVer = (a, b) => {
  const [A, B] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i++) if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0);
  return 0;
};

const tplVersion = readFileSync(join(TPL, 'harness.version'), 'utf8').trim();
const manifest = readJson(repoPath('.claude', 'harness-manifest.json'));
const curVersion = manifest?.templateVersion
  ?? (existsSync(repoPath('harness.version')) ? readFileSync(repoPath('harness.version'), 'utf8').trim() : '0.0.0');

console.log(`\n=== NÂNG CẤP HARNESS ===`);
console.log(`  hiện tại: ${curVersion}${manifest ? '' : '  (không có manifest — lần đầu nâng cấp)'}`);
console.log(`  template: ${tplVersion}`);

if (cmpVer(curVersion, tplVersion) === 0) {
  console.log(`\n  Đã ở version mới nhất.\n`);
  process.exit(0);
}
if (cmpVer(curVersion, tplVersion) > 0) {
  console.log(`\n  ⚠️  Project MỚI HƠN template. Bạn đang trỏ vào template cũ?\n`);
  process.exit(1);
}

// ── Changelog trong khoảng ───────────────────────────────────────────────────
const changelogPath = join(TPL, 'HARNESS-CHANGELOG.md');
if (existsSync(changelogPath)) {
  const cl = readFileSync(changelogPath, 'utf8');
  const sections = cl.split(/^## /m).slice(1);
  const relevant = sections.filter(s => {
    const v = (s.match(/^(\d+\.\d+\.\d+)/) || [])[1];
    return v && cmpVer(v, curVersion) > 0 && cmpVer(v, tplVersion) <= 0;
  });
  if (relevant.length) {
    console.log(`\n--- THAY ĐỔI (${relevant.length} version) ---`);
    for (const s of relevant) console.log('## ' + s.trim().split('\n---')[0]);
  }
}

// ── So sánh file ─────────────────────────────────────────────────────────────
// Chỉ nâng cấp lớp CƠ CHẾ. File nội dung (AGENTS.md, config, features/) là của
// project — template không được đụng, chỉ báo nếu có thay đổi đáng biết.
const MECHANISM = [
  '.claude/hooks', '.claude/skills', '.claude/agents',
  'tooling/lib', 'tooling/knowledge', 'tooling/fixtures', 'tooling/generators',
  'tooling/init.mjs', 'tooling/test-hooks.mjs', 'tooling/apply-to.mjs', 'tooling/upgrade.mjs',
  'tooling/fixlog.mjs', 'tooling/coactivity.mjs', 'tooling/harness-size.mjs',
  'tooling/capo-report.mjs', 'tooling/harness-doctor.mjs', 'tooling/doctor.mjs', 'tooling/entropy-scan.mjs',
  'tooling/check-reservations.mjs', 'tooling/check-feature-integrity.mjs',
  'tooling/wt-clean.mjs', 'tooling/statusline.mjs', 'tooling/precommit-scan.mjs',
  '.githooks', 'evals/run.mjs', 'harness-migrations',
];
// File tham chiếu: template cải thiện nhưng project có thể đã sửa. Chỉ BÁO, không đụng.
const ADVISORY = [
  'docs/CONFLICTS.md', 'docs/WIP.md', 'docs/BRANCH-PROTECTION.md', 'docs/ROADMAP-30D.md',
  'docs/ANTI-PATTERNS.md', 'docs/ARCHITECTURE.md', 'docs/ECONOMICS.md',
  'docs/MULTI-PROJECT.md', 'docs/RECOVERY.md', 'docs/TEAM.md',
  '.github/workflows/harness-parity.yml', '.github/pull_request_template.md',
];

function filesUnder(root, rel) {
  const abs = join(root, rel);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [rel];
  const out = [];
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    out.push(...filesUnder(root, join(rel, e.name).split(sep).join('/')));
  }
  return out;
}

const add = [], safe = [], conflict = [], advisory = [], same = [];

for (const group of MECHANISM) {
  for (const f of filesUnder(TPL, group)) {
    const local = repoPath(f), tpl = join(TPL, f);
    if (!existsSync(local)) { add.push(f); continue; }
    const localHash = sha(local), tplHash = sha(tpl);
    if (localHash === tplHash) { same.push(f); continue; }
    const recorded = manifest?.files?.[f];
    if (recorded && recorded !== localHash) conflict.push(f);   // project đã sửa
    else safe.push(f);                                          // chưa sửa → ghi đè an toàn
  }
}

for (const f of ADVISORY) {
  const local = repoPath(f), tpl = join(TPL, f);
  if (!existsSync(tpl)) continue;
  if (!existsSync(local)) { add.push(f); continue; }
  if (sha(local) !== sha(tpl)) advisory.push(f);
}

// ── Migration script ─────────────────────────────────────────────────────────
const migDir = join(TPL, 'harness-migrations');
const migrations = [];
if (existsSync(migDir)) {
  for (const f of readdirSync(migDir).filter(f => f.endsWith('.mjs') && !f.startsWith('_')).sort()) {
    const mod = await import(pathToFileURL(join(migDir, f)).href);
    if (!mod.version) continue;
    if (cmpVer(mod.version, curVersion) > 0 && cmpVer(mod.version, tplVersion) <= 0) {
      migrations.push({ file: f, ...mod });
    }
  }
  migrations.sort((a, b) => cmpVer(a.version, b.version));
}

// ── Báo cáo ──────────────────────────────────────────────────────────────────
console.log(`\n--- KẾ HOẠCH ---`);
console.log(`  ${same.length} file đã giống template`);
console.log(`  ${add.length} file MỚI  → sẽ thêm`);
console.log(`  ${safe.length} file cập nhật an toàn (project chưa sửa)`);
console.log(`  ${conflict.length} file XUNG ĐỘT (project ĐÃ sửa)  → ${FORCE ? '⚠️ SẼ GHI ĐÈ' : 'GIỮ NGUYÊN, ghi ra .new'}`);
console.log(`  ${advisory.length} tài liệu template có bản mới → chỉ BÁO, không đụng`);
console.log(`  ${migrations.length} migration script sẽ chạy`);

if (conflict.length) {
  console.log(`\n  ⚠️  File project đã sửa:`);
  for (const f of conflict) console.log(`     ${f}`);
}
if (migrations.length) {
  console.log(`\n  Migration:`);
  for (const m of migrations) console.log(`     ${m.version}  ${m.description}`);
}
if (advisory.length) {
  console.log(`\n  Tài liệu có bản mới (tự quyết định lấy hay không):`);
  for (const f of advisory) console.log(`     ${f}`);
}

if (!APPLY) {
  console.log(`\n  Xem trước. Thêm --apply để thực hiện.`);
  console.log(`  Nên commit hết trước khi nâng cấp — để rollback bằng git nếu cần.\n`);
  process.exit(0);
}

// ── Thực hiện ────────────────────────────────────────────────────────────────
const ok = [], warn = [], fail = [];

for (const f of [...add, ...safe]) {
  mkdirSync(dirname(repoPath(f)), { recursive: true });
  cpSync(join(TPL, f), repoPath(f));
}
ok.push(`${add.length + safe.length} file đã cập nhật`);

for (const f of conflict) {
  if (FORCE) {
    cpSync(join(TPL, f), repoPath(f));
    warn.push(`GHI ĐÈ (--force-overwrite): ${f} — thay đổi của bạn đã mất, khôi phục bằng git`);
  } else {
    cpSync(join(TPL, f), repoPath(f + '.new'));
    warn.push(`${f} — bản template ở ${f}.new, tự merge rồi xoá .new`);
  }
}

for (const m of migrations) {
  try {
    await m.up({ repoPath, readJson, writeJson, readFileSync, writeFileSync, existsSync, run,
                 // tplPath + copyFromTemplate: cho migration SEED được nội dung mới.
                 // Không có chúng, migration chỉ biến đổi được thứ đã có — và một file
                 // nội dung mới của template (eval task seed, doc, rule) sẽ không bao
                 // giờ tới được project đã áp, vì upgrade chỉ cập nhật lớp CƠ CHẾ.
                 tplPath: (...p) => join(TPL, ...p),
                 copyFromTemplate: (rel, { overwrite = false } = {}) => {
                   const src = join(TPL, rel), dst = repoPath(rel);
                   if (!existsSync(src)) throw new Error(`template không có ${rel}`);
                   if (existsSync(dst) && !overwrite) return false;
                   mkdirSync(dirname(dst), { recursive: true });
                   cpSync(src, dst);
                   return true;
                 },
                 // Log có ⚠ đi vào WARN, không vào OK. Một cảnh báo in dưới nhãn
                 // "OK" là cảnh báo sẽ bị bỏ qua.
                 log: msg => (String(msg).includes('⚠') ? warn : ok).push(`  [${m.version}] ${msg}`) });
    ok.push(`migration ${m.version} — ${m.description}`);
  } catch (e) {
    fail.push(`migration ${m.version} THẤT BẠI: ${e.message}`);
  }
}

// ── Ghi manifest mới ─────────────────────────────────────────────────────────
const files = {};
for (const group of MECHANISM) {
  for (const f of filesUnder(REPO_ROOT, group)) {
    try { files[f] = sha(repoPath(f)); } catch {}
  }
}
writeJson(repoPath('.claude', 'harness-manifest.json'), {
  templateVersion: tplVersion,
  upgradedAt: new Date().toISOString(),
  previousVersion: curVersion,
  source: TPL,
  files,
});
if (existsSync(repoPath('harness.version'))) writeFileSync(repoPath('harness.version'), tplVersion + '\n');
ok.push(`manifest → ${tplVersion}`);

// ── Verify ───────────────────────────────────────────────────────────────────
const t = run('node', [repoPath('tooling', 'test-hooks.mjs')]);
if (t.status !== 0) fail.push('hook test ĐỎ sau khi nâng cấp — chạy `node tooling/test-hooks.mjs` để xem');
else ok.push('hook test xanh sau khi nâng cấp');

report('NÂNG CẤP', { ok, warn, fail });
console.log(`  Bước tiếp theo:
    1. git diff — đọc thay đổi
    2. Xử lý mọi file .new nếu có
    3. node tooling/harness-doctor.mjs
    4. Đọc HARNESS-CHANGELOG.md của template, cập nhật .claude/whats-new.md cho team
`);
process.exit(fail.length ? 1 : 0);
