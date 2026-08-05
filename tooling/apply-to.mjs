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
import { REPO_ROOT, report, run, REQUIRED_IGNORE, REQUIRED_ATTRIBUTES, REQUIRED_UNIGNORE, missingLines, CI_ESCAPE_HATCH, MECHANISM_PATHS, repoRole } from './lib/harness.mjs';

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
// MERGE   = file DANH SÁCH DÒNG của project — thêm dòng thiếu, không copy, không bỏ qua
//
// BA phép, không phải hai. `SEED` (copy-nếu-chưa-có) là phép SAI cho `.gitignore` và
// `.gitattributes`: project thật nào cũng đã có chúng ⇒ dòng của harness không bao giờ
// tới đúng nhóm project mà harness nhắm tới. Xem `REQUIRED_IGNORE` trong lib/harness.mjs.
const HARNESS = MECHANISM_PATHS;
const SEED = [
  'AGENTS.md', 'CLAUDE.md', 'harness.config.json',
  // `.gitmessage` KHÔNG ở MERGE: nó là văn xuôi (khuôn commit message), không phải danh
  // sách dòng. Thêm dòng vào giữa một khuôn văn xuôi là làm hỏng nó.
  '.gitmessage',
  '.claude/settings.json', '.claude/settings.local.example.json', '.claude/whats-new.md',
  '.claude/rules', '.claude/learnings/_TEMPLATE.md',
  '.mcp.json.example',
  'knowledge/README.md', 'knowledge/lessons/_TEMPLATE.md',
  'knowledge/lessons/0001-lockfile-merge-tay.md', 'knowledge/lessons/0002-guard-ban-nham.md',
  'knowledge/lessons/0003-self-test-gia-dinh-repo-cua-no.md',
  'features/_index.json', 'features/_TEMPLATE.json',
  'docs/CONFLICTS.md', 'docs/WIP.md', 'docs/BRANCH-PROTECTION.md',
  'docs/DOR-DOD.md', 'docs/onboarding.md', 'docs/ROADMAP-30D.md',
  'docs/ANTI-PATTERNS.md', 'docs/ARCHITECTURE.md', 'docs/ECONOMICS.md',
  'docs/MULTI-PROJECT.md', 'docs/RECOVERY.md', 'docs/TEAM.md', 'docs/DESIGN.md',
  // ADR của TEMPLATE ở `docs/adr/harness/`, KHÔNG ở `docs/adr/`. Trước 2.5.0 chúng hạ
  // cánh thành `docs/adr/0001-*` và `0002-*` ở project đích, tức là lớp harness CHIẾM số
  // 0001 và 0002 của SẢN PHẨM: ADR đầu tiên của đội buộc phải là 0003, và quyết định đầu
  // tiên của product được đánh số như thể nó là quyết định thứ ba. Cùng lý do với
  // `docs/progress/<issue>.md`: đánh số dùng chung là một vùng conflict, và ở đây nó
  // conflict giữa HAI SẢN PHẨM khác nhau.
  'docs/adr/_TEMPLATE.md', 'docs/adr/harness',
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

const MERGE = [
  { f: '.gitignore', required: REQUIRED_IGNORE },
  { f: '.gitattributes', required: REQUIRED_ATTRIBUTES },
];

/** File harness mà cả đội PHẢI có — nếu git đang ignore chúng thì harness chỉ tồn tại trên MỘT máy. */
const MUST_TRACK = ['.claude/settings.json', '.claude/hooks/observe.mjs', 'harness.config.json'];
function buriedAtDest() {
  if (run('git', ['rev-parse', '--git-dir'], { cwd: DEST }).status !== 0) return [];
  return MUST_TRACK.filter(p => run('git', ['check-ignore', '-q', p], { cwd: DEST }).status === 0);
}

/** Không có file → copy cả bản template. Có rồi → CHỈ thêm dòng thiếu, dưới một mốc có tên. */
function planMerge() {
  return MERGE.map(({ f, required }) => {
    const dst = join(DEST, f);
    // `!.claude/` chỉ được thêm khi ĐO THẤY có file bị chôn — không thêm vô điều kiện.
    // Nó đảo một quyết định tường minh của project, nên nó phải có bằng chứng và phải NÓI RA.
    const buried = f === '.gitignore' ? buriedAtDest() : [];
    const want = buried.length ? [...REQUIRED_UNIGNORE, ...required] : required;
    if (!existsSync(dst)) return { f, action: 'create', missing: want, buried };
    return { f, action: 'merge', missing: missingLines(readFileSync(dst, 'utf8'), want), buried };
  });
}

function applyMerge(m) {
  const dst = join(DEST, m.f);
  if (m.action === 'create') { cpSync(join(REPO_ROOT, m.f), dst); return; }
  if (!m.missing.length) return;                      // idempotent: chạy lại là no-op
  const cur = readFileSync(dst, 'utf8');
  const block = `\n# ── harness (apply-to.mjs) — xem REQUIRED_IGNORE trong tooling/lib/harness.mjs ──\n`
    + m.missing.join('\n') + '\n';
  writeFileSync(dst, cur.endsWith('\n') ? cur + block : cur + '\n' + block, 'utf8');
}

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
//
// CHỈ CÓ NGHĨA TRONG REPO TEMPLATE. Ở project ĐÍCH, mọi file source của project (app/, src/, lib/…)
// đương nhiên không nằm trong HARNESS/SEED, nên check này báo "thiếu N file" với N = cả codebase —
// đỏ trong khi hệ thống hoàn toàn đúng. Một check đỏ-mãi dạy người ta phớt lờ màu đỏ, nên nó tự
// nhận ra mình đang ở đâu và bỏ qua.
//
// Tín hiệu: `.claude/harness-manifest.json` chỉ được apply-to ghi ra ở ĐÍCH, không bao giờ tồn tại
// trong template. Đây là tín hiệu sẵn có, không phải cờ mới phải nhớ bật.
const IS_TARGET_PROJECT = repoRole() === 'consumer';
if (AUDIT && IS_TARGET_PROJECT) {
  console.log(
    '\n○ AUDIT bỏ qua: đây là project ĐÍCH (có .claude/harness-manifest.json), không phải repo template.\n' +
      '  Check này đối chiếu HARNESS/SEED với cây file của TEMPLATE — chạy nó ở đây chỉ báo\n' +
      '  source của chính project là "thiếu". Chạy `--audit` trong repo template.\n',
  );
  process.exit(0);
}
if (AUDIT) {
  const covered = new Set([...HARNESS, ...SEED, ...MERGE.map(m => m.f)].flatMap(filesUnder));
  // Cố ý không mang đi: nội dung riêng của repo này, artifact sinh ra, hoặc file gốc
  const IGNORE = [
    // `\.git(\/|$)` — dấu `$` KHÔNG dư. Trong một WORKTREE, `.git` là một FILE, không
    // phải thư mục, nên `/^\.git\//` không khớp nó và audit báo "bỏ sót .git". Trạng thái
    // BÌNH THƯỜNG của phiên harness là ở TRONG worktree (AGENTS.md: một issue = một
    // worktree) ⇒ không có `$` thì check này đỏ-giả cho gần như mọi người, và eval
    // `0001-harness-tu-kiem` đỏ theo. Cùng lớp với knowledge/lessons/0003.
    /^\.git(\/|$)/, /^node_modules\//, /^\.harness-pack\//, /^knowledge\/incoming\//,
    /^\.claude\/(telemetry|state)\//, /^\.vscode\//,
    /^README\.md$/,                                   // README của chính template
    // `package.json` của TEMPLATE tồn tại chỉ để `npx github:...` chạy được. Project đích
    // nào cũng có package.json của riêng nó (hoặc cố ý không có, nếu là Python/Go) — copy
    // đè lên nó là phá dự án, và tạo mới một cái rỗng trong repo Go là để lại rác gây nhầm.
    /^package\.json$/,
    // `tooling/cli.mjs` cũng vậy: nó là điểm vào của TEMPLATE (`npx ... init`). Ở project
    // đích nó không có việc gì làm — apply-to ở đó đã là bản copy rồi.
    /^tooling\/cli\.mjs$/,
    /^knowledge\/index\.json$/,                       // sinh tự động
    // Sổ consumer là dữ liệu của TEMPLATE về consumer CỦA NÓ. Một repo tiêu thụ không có
    // consumer nào, nên ship sổ sang đó là ship danh sách của người khác — và
    // `consumers.mjs` ở đó cũng tự bỏ qua (nó chỉ chạy khi repoRole() === 'template').
    /^knowledge\/consumers\.json$/,
    // Sổ quyết định của vòng học là lịch sử CỦA REPO NÀY — pack nào đã MERGE/REJECT và vì sao.
    // Ship nó sang project khác là ship quyết định của người khác, và tệ hơn: bên nhận sẽ đọc
    // nó như thể mình đã từ chối những thứ mình chưa từng thấy. `accept.mjs` ở đó tự ghi sổ
    // riêng. (Sổ này nằm NGOÀI `knowledge/incoming/` từ 2.10.0 — trong đó thì nó bị ignore và
    // chưa từng được commit ở đâu.)
    /^knowledge\/DECISIONS\.log$/,
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
const merges = planMerge();
const toAppend = merges.filter(m => m.action === 'merge' && m.missing.length);

console.log(`\n=== ÁP HARNESS → ${DEST} ===`);
console.log(`  tạo mới:   ${created.length}`);
console.log(`  cập nhật:  ${updated.length}${UPDATE ? '' : '  (dùng --update để cập nhật lớp harness)'}`);
console.log(`  bỏ qua:    ${skipped.length}  (đã tồn tại)`);
console.log(`  thêm dòng: ${toAppend.reduce((n, m) => n + m.missing.length, 0)}  (${merges.map(m => m.f).join(', ')})`);

if (!APPLY) {
  console.log('\n  Xem trước. Thêm --apply để thực hiện.\n');
  for (const p of [...created, ...updated].slice(0, 40)) console.log(`    ${p.action.padEnd(7)} ${p.f}`);
  if (created.length + updated.length > 40) console.log(`    … và ${created.length + updated.length - 40} file nữa`);
  for (const m of merges) {
    if (m.action === 'create') console.log(`    create  ${m.f}  (chưa có → copy cả bản template)`);
    else if (m.missing.length) for (const l of m.missing) console.log(`    +dòng   ${m.f}: ${l}`);
    else console.log(`    ok      ${m.f}  (đã có đủ dòng bắt buộc)`);
  }
  console.log('');
  process.exit(0);
}

for (const p of [...created, ...updated]) {
  const src = join(REPO_ROOT, p.f);
  const dst = join(DEST, p.f);
  mkdirSync(join(dst, '..'), { recursive: true });
  cpSync(src, dst);
}
for (const m of merges) applyMerge(m);

// Cửa thoát CI là của TEMPLATE, không của project. Nó đúng ở đây (commands rỗng là
// placeholder) và sai ở đó (gate bị bỏ qua vẫn cho tick XANH). Trước 2.6.0 chỉ `upgrade`
// xử lý nó qua migration 004, nên project áp MỚI nhận cửa thoát VÀ một dòng CHẶN của
// harness-doctor ngay phút đầu — công cụ tự tạo lỗi rồi tự báo lỗi đó.
const ciDest = join(DEST, '.github', 'workflows', 'ci.yml');
let hatchRemoved = false;
if (existsSync(ciDest)) {
  const before = readFileSync(ciDest, 'utf8');
  const after = before.replace(CI_ESCAPE_HATCH, '\n');
  if (after !== before) { writeFileSync(ciDest, after, 'utf8'); hatchRemoved = true; }
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
// HỢP NHẤT, không thay thế. Manifest là hồ sơ TÍCH LUỸ của project: ngoài hash file, nó
// giữ `profile` do `setup.mjs` ghi (stack, platform, deploy, những gì KHÔNG đọc được).
// Ghi đè cả object làm `profile` bốc hơi ở mỗi lần `--update`, và triệu chứng là
// `harness-doctor` báo "chưa chạy setup" cho một project đã chạy setup — một lời buộc tội
// sai, đúng loại làm người ta ngừng tin bảng chẩn đoán. Gặp thật khi thêm profile ở 2.6.0.
let prevManifest = {};
try { prevManifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch {}
// `seededLessons`: bài học ĐI KÈM template, không phải của project. Không ghi lại thì
// không ai phân biệt được chúng với bài học project tự viết — và `entropy-scan` sẽ nhắc
// "gửi bài học lên template" cho những bài học VỪA TỪ template đi xuống. Ngày tháng KHÔNG
// thay thế được: một bài seed `added` đúng ngày áp template trông y hệt một bài tự viết.
const seededLessons = SEED.filter(r => r.startsWith('knowledge/lessons/'))
  .flatMap(filesUnder).map(f => f.split('/').pop());
writeFileSync(manifestPath, JSON.stringify({
  ...prevManifest,
  templateVersion: version,
  appliedAt: new Date().toISOString(),
  source: REPO_ROOT,
  seededLessons: [...new Set([...(prevManifest.seededLessons ?? []), ...seededLessons])],
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

const ok = [
  `${created.length} file tạo mới`,
  ...(hatchRemoved ? ['ci.yml: đã xoá cửa thoát HARNESS_ALLOW_SKIPPED_GATES (nó chỉ đúng ở repo template) → gate bị BỎ QUA sẽ làm CI ĐỎ ở đây'] : []),
  ...(updated.length ? [`${updated.length} file cập nhật`] : []),
  ...merges.map(m => m.action === 'create' ? `${m.f}: tạo mới`
    : m.missing.length ? `${m.f}: thêm ${m.missing.length} dòng bắt buộc (${m.missing.join(' · ')})`
    : `${m.f}: đã đủ dòng bắt buộc, không đổi`),
];
const warn = todos.length ? [`${todos.length} file còn CHANGEME:`, ...todos.map(t => '   ' + t)] : [];
for (const m of merges.filter(m => m.buried?.length)) {
  warn.push(`${m.f} của project đang ignore ${m.buried.join(' · ')} → đã thêm \`!.claude/\`.`
    + ` Harness của TEAM phải được commit; nếu không, chỉ máy vừa chạy lệnh này có nó.`
    + ` Xem lại dòng ignore rộng (thường là \`.claude/\`) và commit .claude/ trong PR đầu tiên.`);
}

report('ÁP HARNESS', { ok, warn });

console.log(`  Bước tiếp theo trong ${DEST}:

    1. node tooling/setup.mjs --apply  ★ VIỆC SỐ 1 — đọc repo này, đề xuất commands
                                        kèm bằng chứng, và TỪ CHỐI kết thúc khi
                                        commands.verify còn rỗng
    2. node tooling/init.mjs
    3. $EDITOR AGENTS.md               ← chỉ 3 mục: Project · Lệnh · Gotchas
    4. $EDITOR .github/CODEOWNERS      ← handle thật
    5. Bật merge queue + branch protection (docs/BRANCH-PROTECTION.md)

  Không có commands.verify thì gate không tồn tại và harness này chỉ là trang trí.
  Xem trước những gì setup phát hiện được, không ghi gì: node tooling/setup.mjs --detect

  Nạp trí tuệ từ repo cũ:
    node tooling/knowledge/import.mjs <đường-dẫn>/.harness-pack
`);
