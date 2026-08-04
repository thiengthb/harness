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
import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, readdirSync, statSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, repoPath, readJson, writeJson, report, run, MECHANISM_PATHS } from './lib/harness.mjs';

const args = process.argv.slice(2);
const argOf = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const src = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--ref');
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force-overwrite');
const REF = argOf('--ref');
const ALLOW_UNPINNED = args.includes('--allow-unpinned');

if (!src) {
  console.error(`Cách dùng:
  node tooling/upgrade.mjs <đường-dẫn-template>            xem trước
  node tooling/upgrade.mjs <đường-dẫn-template> --apply
  node tooling/upgrade.mjs <URL-git> --ref v2.6.0 --apply  lấy template TỪ XA

Template có thể là thư mục local, hoặc URL git (https:// hoặc git@) kèm --ref.
LUÔN xem trước rồi mới --apply.`);
  process.exit(1);
}

/**
 * Template TỪ XA — nếu không có đường này, một project được dựng bằng bootstrap từ xa
 * **mắc kẹt vĩnh viễn ở version khai sinh**: `upgrade` đòi một thư mục template local mà
 * project đó chưa bao giờ có, và `manifest.source` ghi một đường dẫn tạm đã bị xoá.
 *
 * PIN THEO TAG/SHA, KHÔNG BAO GIỜ THEO `main` — cùng luật mà `knowledge/README.md` đã đặt
 * cho pack, cùng lý do và ở đây hậu quả lớn hơn: một commit sai trên `main` sẽ được kéo về
 * ĐỒNG THỜI bởi mọi project, và nó ghi vào lớp CƠ CHẾ (hook, gate, migration) chứ không
 * phải vào tài liệu.
 */
let TPL, remote = null;
if (/^(https?:\/\/|git@)/.test(src)) {
  if (!REF && !ALLOW_UNPINNED) {
    console.error(`\n⛔ Lấy template từ xa mà KHÔNG pin version.\n`
      + `  Thêm --ref <tag|sha>. Không pin nghĩa là bạn kéo về bất cứ thứ gì đang nằm trên nhánh\n`
      + `  mặc định lúc này — và một commit sai ở đó sẽ vào MỌI project của bạn cùng lúc, ở lớp\n`
      + `  cơ chế (hook, gate, migration). Cùng luật với pack: knowledge/README.md.\n`
      + `  Thật sự muốn: --allow-unpinned.\n`);
    process.exit(1);
  }
  const tmp = join(tmpdir(), `harness-tpl-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  const clone = run('git', ['clone', '--depth', '1', ...(REF ? ['--branch', REF] : []), src, tmp], { cwd: tmpdir() });
  if (clone.status !== 0) {
    console.error(`\n⛔ Không clone được ${src}${REF ? ` @ ${REF}` : ''}\n${clone.stderr}`);
    process.exit(1);
  }
  TPL = tmp;
  remote = { url: src, ref: REF ?? '(không pin)', sha: run('git', ['rev-parse', 'HEAD'], { cwd: tmp }).stdout.trim() };
  console.log(`\n  template: ${src} @ ${remote.ref}  (${remote.sha.slice(0, 8)})`);
  // `--ref main` ĐI QUA cửa kiểm ở trên nhưng KHÔNG phải là pin: nhánh di chuyển, nên hai
  // project nâng cấp cách nhau một ngày nhận hai bản khác nhau trong khi manifest của
  // chúng ghi cùng một `source`. Cảnh báo, không chặn — sha vẫn được ghi lại nên vẫn
  // truy được về sau.
  if (/^(main|master|HEAD)$/.test(String(REF))) {
    console.log(`  ⚠️  \`--ref ${REF}\` là NHÁNH, không phải mốc. Hôm nay nó là ${remote.sha.slice(0, 8)};`
      + ` ngày mai là thứ khác.\n      Dùng tag version (\`--ref v${readFileSync(join(tmp, 'harness.version'), 'utf8').trim()}\`) hoặc sha đầy đủ.`);
  }
  process.on('exit', () => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });
} else {
  TPL = resolve(src);
}
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
const MECHANISM = MECHANISM_PATHS;
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

// ── PHA 2: chạy lại bằng CHÍNH BẢN MỚI của script này ────────────────────────
// Danh sách file cơ chế nằm TRONG script này, và script đang chạy luôn là bản CŨ (bản nằm
// trong project). Nên mọi file `tooling/*.mjs` ra đời sau version của project là VÔ HÌNH
// với nó — thư mục thì được duyệt đệ quy nên không sao, file khai theo TÊN thì đóng băng.
//
// Đo trên `warehouse` 2026-08-05: nâng v1.4.0 → v2.7.1 xong vẫn THIẾU `tooling/gates.mjs`,
// `tooling/setup.mjs`, `tooling/harness-doctor.mjs` — và `settings.json` thì đã được
// migration trỏ vào `gates.mjs`. Repo không cũ, repo HỎNG.
//
// Bước copy ở trên vừa thay chính file này. Chạy lại một lần bằng bản mới: nó có danh sách
// mới, thấy các file kia, và mang chúng sang. Migration idempotent theo hợp đồng (điều kiện
// ③ của test-migrations) nên chạy lại là an toàn. `HARNESS_UPGRADE_PHASE2` chặn vòng lặp.
if (!process.env.HARNESS_UPGRADE_PHASE2 && (add.includes('tooling/upgrade.mjs') || safe.includes('tooling/upgrade.mjs'))) {
  console.log(`\n  ↻ Bản \`tooling/upgrade.mjs\` vừa được cập nhật. Chạy lại bằng bản MỚI để nó`
    + ` mang nốt những file mà danh sách CŨ không biết đến.\n`);
  const r = run('node', [repoPath('tooling', 'upgrade.mjs'), ...args], {
    cwd: REPO_ROOT, capture: false, env: { HARNESS_UPGRADE_PHASE2: '1' },
  });
  process.exit(r.status ?? 0);
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
                 // "Đổi cấu trúc thư mục" là một trong những việc README của
                 // harness-migrations/ liệt kê là BẮT BUỘC phải có migration — nhưng cho
                 // tới 2.5.0 ctx không có cách nào DI CHUYỂN một file. Hệ quả: migration
                 // phải tự `import` node:fs (không migration nào làm) hoặc gọi `git mv`
                 // (fail ở test, vì thư mục fixture không phải git repo). Nên việc đó
                 // trước đây chỉ tồn tại trên giấy.
                 // Đổi tên, KHÔNG copy-rồi-xoá: `renameSync` là nguyên tử trong cùng
                 // filesystem, còn copy-rồi-xoá thì đứt giữa đường là mất file.
                 moveFile: (relFrom, relTo) => {
                   const from = repoPath(relFrom), to = repoPath(relTo);
                   if (!existsSync(from) || existsSync(to)) return false;
                   mkdirSync(dirname(to), { recursive: true });
                   renameSync(from, to);
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
// HỢP NHẤT, không thay thế — cùng lý do như trong apply-to.mjs: `profile` của setup.mjs
// (và bất cứ khoá nào thêm sau này) không được bốc hơi ở mỗi lần nâng cấp.
writeJson(repoPath('.claude', 'harness-manifest.json'), {
  ...(readJson(repoPath('.claude', 'harness-manifest.json')) ?? {}),
  templateVersion: tplVersion,
  upgradedAt: new Date().toISOString(),
  previousVersion: curVersion,
  // Đường dẫn tạm của một clone sắp bị xoá KHÔNG phải là nguồn. Ghi URL + ref + sha thì
  // lần nâng cấp sau (và người đọc manifest 3 tháng nữa) mới biết bản này từ đâu ra.
  source: remote ? `${remote.url}@${remote.ref}` : TPL,
  ...(remote ? { sourceSha: remote.sha } : {}),
  files,
});
// ── KIỂM TOÀN VẸN: con trỏ nào trong settings.json trỏ vào hư không? ─────────
// Bắt cả LỚP lỗi, không riêng ca đã biết: sau nâng cấp, mọi `node <đường-dẫn>` mà
// `.claude/settings.json` gọi phải tồn tại. Một hook không tồn tại KHÔNG báo lỗi lúc cấu
// hình — nó ném ERR_MODULE_NOT_FOUND ở giữa phiên làm việc của người dùng, hoặc tệ hơn,
// im lặng không chặn gì. Đây là kiểm rẻ nhất có thể có cho "nâng cấp làm repo hỏng".
const settingsRaw = existsSync(repoPath('.claude', 'settings.json'))
  ? readFileSync(repoPath('.claude', 'settings.json'), 'utf8') : '';
const dangling = [...settingsRaw.matchAll(/node\s+([\w./-]+\.mjs)/g)]
  .map(m => m[1]).filter((v, i, a) => a.indexOf(v) === i)
  .filter(rel => !existsSync(repoPath(...rel.split('/'))));
if (dangling.length) {
  fail.push(`.claude/settings.json gọi ${dangling.length} file KHÔNG TỒN TẠI: ${dangling.join(' · ')}`);
  fail.push('  Nâng cấp đã để repo ở trạng thái HỎNG (hook ném lỗi giữa phiên, hoặc im lặng không chặn gì).');
  fail.push(`  Sửa: node ${join(TPL, 'tooling', 'apply-to.mjs')} ${REPO_ROOT} --apply --update`);
}

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
