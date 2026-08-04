#!/usr/bin/env node
/**
 * Gửi những gì project này học được NGƯỢC LÊN template harness.
 *
 *   node tooling/knowledge/upstream.mjs                       # xem trước (đọc knowledge.upstream)
 *   node tooling/knowledge/upstream.mjs /đường/dẫn/template --apply
 *
 * CHIỀU NÀY TRƯỚC ĐÂY KHÔNG TỒN TẠI.
 *
 * `export`/`import` là NGANG: project A → project B. Template không tham gia.
 * Hậu quả: project D bạn tạo tháng sau vẫn khởi động từ đúng số bài học seed của
 * template, dù A/B/C đã học được 30 thứ. Trí tuệ tích luỹ ở LÁ, không bao giờ về GỐC.
 *
 * Script này gom ba thứ mà template cần, và CHỈ ba thứ đó:
 *
 *   1. BÀI HỌC mang đi được (universal + stack:*) — cùng logic export
 *   2. GATE của chúng: file trong `evals/tasks/` mà bài học trỏ tới qua `evals:`.
 *      Không có gate thì bên nhận không kiểm được — và "gate là bước không được bỏ".
 *   3. DIFF CƠ CHẾ: file harness mà project này đã sửa so với
 *      `.claude/harness-manifest.json`. Mỗi file như vậy là một trong hai thứ:
 *      tuỳ biến đặc thù project (bỏ), hoặc CẢI TIẾN CHUNG mà template đang thiếu
 *      (đóng góp). Người phân loại, không phải script.
 *
 * KHÔNG BAO GIỜ ghi vào `.claude/`, `tooling/`, hay `harness.config.json` của
 * template. Mọi thứ vào `knowledge/incoming/<project>/` của template + một
 * CONTRIB.md có checklist. Cùng nguyên tắc với `import.mjs`, cùng lý do: một
 * project ghi thẳng vào template thì template thành đường supply-chain vào MỌI
 * project khác.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { parseFrontmatter } from '../lib/frontmatter.mjs';
import { repoPath, config, report, exists, git, readJson, stateDir } from '../lib/harness.mjs';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const cfg = config();
const target = args.find(a => !a.startsWith('--')) || cfg.knowledge?.upstream;

if (!target) {
  console.error(`Không biết template ở đâu.

  node tooling/knowledge/upstream.mjs /đường/dẫn/template

Hoặc khai một lần trong harness.config.json:
  "knowledge": { "upstream": "/đường/dẫn/template" }`);
  process.exit(1);
}

/**
 * Template có thể ở XA. Trước 2.7.0 script này chỉ nhận đường dẫn FILESYSTEM — nghĩa là
 * chiều LÊN của vòng học chỉ khép được khi template và project nằm trên CÙNG MỘT MÁY.
 * `import.mjs` đã nhận URL từ lâu; chiều ngược lại thì không, nên trí tuệ đi xuống được
 * mà không đi lên được, và đó đúng là chiều mà `knowledge/README.md` gọi là "chiều làm
 * template tốt lên".
 *
 * Clone vào `.harness-pack/` (đã nằm trong REQUIRED_IGNORE, không lẫn vào git của project).
 * Script này KHÔNG push và KHÔNG mở PR — nó IN RA lệnh. Ghi thẳng vào template là đường
 * supply-chain vào MỌI project khác; cổng đó phải có người, và người đó là DRI của template.
 */
let TPL = target, remoteUrl = null;
if (/^(https?:\/\/|git@)/.test(target)) {
  const ref = args.includes('--ref') ? args[args.indexOf('--ref') + 1] : null;
  TPL = repoPath('.harness-pack', 'upstream-clone');
  rmSync(TPL, { recursive: true, force: true });
  mkdirSync(dirname(TPL), { recursive: true });
  const c = git(['clone', '--depth', '1', ...(ref ? ['--branch', ref] : []), target, TPL]);
  if (c.status !== 0) { console.error(`Không clone được ${target}\n${c.stderr}`); process.exit(1); }
  remoteUrl = target;
  console.log(`\n  template: ${target}${ref ? ` @ ${ref}` : ''} → ${TPL}`);
}
if (!exists(TPL)) { console.error(`Không tồn tại: ${TPL}`); process.exit(1); }
if (!exists(join(TPL, 'HARNESS-CHANGELOG.md'))) {
  console.error(`${TPL} không giống repo template harness (không có HARNESS-CHANGELOG.md).`);
  process.exit(1);
}

const ok = [], warn = [], fail = [];
const projectId = cfg.project?.id || 'unknown-project';
const sourceCommit = git(['rev-parse', '--short', 'HEAD']).stdout || 'unknown';

// ── 1. Bài học mang đi được ──────────────────────────────────────────────────
const LESSONS = repoPath('knowledge', 'lessons');
const scopes = cfg.knowledge?.exportScopes ?? ['universal', 'stack'];
const scopeAllowed = s => scopes.some(w =>
  w === s || (w.endsWith('*') && s.startsWith(w.slice(0, -1))) || (w === 'stack' && s.startsWith('stack:')));

const lessons = [];
if (exists(LESSONS)) {
  for (const f of readdirSync(LESSONS).filter(f => f.endsWith('.md') && !f.startsWith('_'))) {
    const raw = readFileSync(join(LESSONS, f), 'utf8');
    const { data } = parseFrontmatter(raw);
    // `candidate` KHÔNG đi lên: nó là bài học nhận từ repo khác mà repo này chưa
    // xác nhận. Gửi nó lên là khuếch đại tin chưa kiểm.
    if (data.status !== 'active') continue;
    if (!scopeAllowed(String(data.scope || 'project'))) continue;
    lessons.push({ f, raw, data });
  }
}

// ── Lọc nhiễu: template đã có gì rồi ─────────────────────────────────────────
// Không lọc thì bundle gửi lên gồm cả những bài học SEED của chính template
// (project nào cũng có chúng vì apply-to copy sang). DRI template phải lội qua
// những bài chính mình viết để tìm cái mới — và cách nhanh nhất để một cơ chế
// review bị bỏ là làm nó ồn.
const strip = e => String(e).replace(/^\s*(\[[^\]]*\]\s*)+/, '').trim();
const tplLessons = new Map();
const tplDir = join(TPL, 'knowledge', 'lessons');
if (exists(tplDir)) {
  for (const f of readdirSync(tplDir).filter(f => f.endsWith('.md') && !f.startsWith('_'))) {
    const { data } = parseFrontmatter(readFileSync(join(tplDir, f), 'utf8'));
    if (!data.title) continue;
    tplLessons.set(String(data.title).toLowerCase().trim(), {
      id: data.id,
      evidence: new Set((Array.isArray(data.evidence) ? data.evidence : []).map(strip)),
    });
  }
}

const fresh = [], mergeable = [], nothingNew = [];
for (const l of lessons) {
  const hit = tplLessons.get(String(l.data.title).toLowerCase().trim());
  if (!hit) { fresh.push(l); continue; }
  const newEvidence = (Array.isArray(l.data.evidence) ? l.data.evidence : [])
    .filter(e => !hit.evidence.has(strip(e)));
  if (newEvidence.length) mergeable.push({ ...l, mergeId: hit.id, newEvidence });
  else nothingNew.push(l);
}
// Chỉ đóng gói cái đáng review. `nothingNew` không đi.
lessons.length = 0;
lessons.push(...fresh, ...mergeable);

// ── 2. Gate của chúng ────────────────────────────────────────────────────────
const evalFiles = new Set();
for (const l of lessons) {
  for (const e of (Array.isArray(l.data.evals) ? l.data.evals : [])) {
    const clean = String(e).split(' ')[0];
    if (exists(repoPath(clean))) evalFiles.add(clean);
    else warn.push(`${l.f}: evals "${clean}" không tồn tại — bài học trỏ vào hư không`);
  }
  if (!Array.isArray(l.data.evals) || !l.data.evals.length) {
    if (['test', 'computational-control', 'generator'].includes(String(l.data.representation))) {
      warn.push(`${l.f}: dạng "${l.data.representation}" mà không có \`evals:\` — bên nhận sẽ không kiểm được nó còn đúng không`);
    }
  }
}

// ── 3. Diff cơ chế so với manifest ───────────────────────────────────────────
const mf = readJson(repoPath('.claude', 'harness-manifest.json'));
const modified = [];
if (!mf) {
  warn.push('không có .claude/harness-manifest.json — không phát hiện được file cơ chế bạn đã sửa. Chạy upgrade.mjs một lần để tạo.');
} else {
  for (const [rel, hash] of Object.entries(mf.files || {})) {
    const abs = repoPath(rel);
    if (!exists(abs)) continue;
    const now = createHash('sha256').update(readFileSync(abs)).digest('hex').slice(0, 16);
    if (now !== hash) modified.push(rel);
  }
}

// ── Artifact mà bài học trỏ tới ──────────────────────────────────────────────
const artifacts = new Set();
for (const l of lessons) {
  for (const a of (Array.isArray(l.data.artifacts) ? l.data.artifacts : [])) {
    const clean = String(a).split(' ')[0];
    if (exists(repoPath(clean)) && statSync(repoPath(clean)).isFile()) artifacts.add(clean);
  }
}

if (!lessons.length && !modified.length) {
  fail.push('Không có gì để đóng góp: 0 bài học mang đi được và 0 file cơ chế đã sửa.');
  fail.push('Đây có thể là ĐÚNG (project còn mới), hoặc là dấu hiệu vòng học chưa chạy:');
  fail.push('  node tooling/fixlog.mjs --top   ·   /harness-retro   ·   /knowledge-promote');
  // KHÔNG ghi `upstream-last.json` ở nhánh này: không có gì được gửi đi. Đóng dấu "đã gửi"
  // cho một lần chạy rỗng sẽ TẮT cảnh báo 30 ngày của entropy-scan trong khi vấn đề còn
  // nguyên — một cái đồng hồ tự reset bằng việc không làm gì.
  process.exit(report('UPSTREAM', { ok, warn, fail }) ? 0 : 1);
}

const DEST = join(TPL, 'knowledge', 'incoming', projectId);

console.log(`\n=== ĐÓNG GÓP NGƯỢC LÊN TEMPLATE ===`);
console.log(`  từ:   ${projectId} @ ${sourceCommit}`);
console.log(`  tới:  ${DEST}\n`);
console.log(`  ${fresh.length} bài học MỚI (template chưa có)`);
console.log(`  ${mergeable.length} bài học template ĐÃ CÓ nhưng bạn có bằng chứng độc lập mới`);
if (nothingNew.length) console.log(`  ${nothingNew.length} bỏ qua (template đã có, không có gì mới)`);
console.log(`  ${evalFiles.size} eval task kèm theo (gate)`);
console.log(`  ${artifacts.size} artifact`);
console.log(`  ${modified.length} file cơ chế project đã sửa → ứng viên cải tiến template`);
if (modified.length) for (const m of modified) console.log(`     ${m}`);

if (!APPLY) {
  console.log('\n  Xem trước. Thêm --apply để ghi.\n');
  process.exit(0);
}

// ── Ghi ──────────────────────────────────────────────────────────────────────
rmSync(DEST, { recursive: true, force: true });
mkdirSync(join(DEST, 'lessons'), { recursive: true });
for (const l of lessons) writeFileSync(join(DEST, 'lessons', l.f), l.raw, 'utf8');

for (const [set, sub] of [[evalFiles, 'evals'], [artifacts, 'artifacts']]) {
  for (const rel of set) {
    const dst = join(DEST, sub, rel);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(repoPath(rel), dst);
  }
}

// Diff cơ chế: gửi DIFF, không gửi file. File đầy đủ chứa cả tuỳ biến đặc thù
// project — người review template cần thấy CHÍNH XÁC cái gì đổi, không phải đọc
// lại cả file rồi tự đoán.
const diffs = [];
for (const rel of modified) {
  const tplFile = join(TPL, rel);
  if (!exists(tplFile)) { diffs.push({ rel, note: 'template không có file này — hoàn toàn mới' }); continue; }
  const d = git(['diff', '--no-index', '--', tplFile, repoPath(rel)], { cwd: repoPath('') });
  const dst = join(DEST, 'mechanism-diffs', rel + '.diff');
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, d.stdout || '(không có diff)\n', 'utf8');
  diffs.push({ rel, lines: (d.stdout.match(/^[+-][^+-]/gm) || []).length });
}

writeFileSync(join(DEST, 'pack.json'), JSON.stringify({
  pack: `upstream-${projectId}`,
  direction: 'upstream',
  sourceProject: projectId,
  sourceCommit,
  sourceHarnessVersion: exists(repoPath('harness.version'))
    ? readFileSync(repoPath('harness.version'), 'utf8').trim() : null,
  exportedAt: new Date().toISOString(),
  lessons: lessons.map(l => ({ id: l.data.id, file: l.f, title: l.data.title, scope: l.data.scope, representation: l.data.representation, occurrences: l.data.occurrences })),
  evals: [...evalFiles].sort(),
  artifacts: [...artifacts].sort(),
  mechanismDiffs: diffs,
}, null, 2) + '\n', 'utf8');

writeFileSync(join(DEST, 'CONTRIB.md'), `# Đóng góp từ ${projectId}

Nguồn: \`${projectId}\` @ \`${sourceCommit}\` · harness v${exists(repoPath('harness.version')) ? readFileSync(repoPath('harness.version'), 'utf8').trim() : '?'}
Gửi lúc: ${new Date().toISOString()}

> **Không có gì được áp dụng tự động.** DRI của template duyệt từng mục.
> Nhận một mục = mọi project tương lai nhận nó. Ngưỡng phải cao hơn nhận vào một project.

## Bài học MỚI (${fresh.length})

${fresh.length ? fresh.map(l => `### ${l.data.id} — ${l.data.title}
- scope \`${l.data.scope}\` · dạng \`${l.data.representation}\` · ${l.data.occurrences ?? '?'} lần
- [ ] Đúng ở **mọi** project, không chỉ ${projectId}? (test: "xoá ${projectId}, mục này còn giá trị không?")
- [ ] Đã ở dạng biểu diễn RẺ NHẤT khả thi? (test > generator > hook > ... > rule)
- [ ] Có \`exit-condition\` cụ thể? Có \`evals:\` để project nhận kiểm được?
- [ ] Nhận: \`node tooling/knowledge/accept.mjs ${projectId}/${l.f}\`
`).join('\n') : '_(không có)_'}

## Bằng chứng độc lập cho bài học ĐÃ CÓ (${mergeable.length})

Đây là mục **giá trị cao nhất và dễ bỏ qua nhất**. Một bài học đã có ở template
nhưng được xác nhận lại ở một project ĐỘC LẬP thì mạnh hơn hẳn: nó loại được giả
thuyết "chỉ đặc thù project đầu tiên".

${mergeable.length ? mergeable.map(l => `### → gộp vào \`${l.mergeId}\` — ${l.data.title}
${l.newEvidence.map(e => `- bằng chứng mới: ${e}`).join('\n')}
- [ ] Gộp: \`node tooling/knowledge/accept.mjs ${projectId}/${l.f} --merge ${l.mergeId}\`
`).join('\n') : '_(không có)_'}

${nothingNew.length ? `## Bỏ qua (${nothingNew.length})

Template đã có, project không thêm bằng chứng nào mới:

${nothingNew.map(l => `- ${l.data.title}`).join('\n')}
` : ''}

## Gate kèm theo (${evalFiles.size})

${[...evalFiles].map(e => `- [ ] \`${e}\` — chạy được ở template không? Nhận bài học mà bỏ gate = nhận tin không kiểm được.`).join('\n') || '_(không có — bài học sẽ không kiểm được ở project nhận)_'}

## Diff cơ chế (${diffs.length}) — ứng viên cải tiến template

Mỗi file dưới đây là **một trong hai thứ**, và bạn phải phân loại:

- **Tuỳ biến đặc thù ${projectId}** → BỎ. Nói với project: chuyển nó ra hook riêng
  hoặc vào \`harness.config.json\`, rồi khôi phục file gốc. Lần nâng cấp sau sẽ sạch.
- **Cải tiến chung template đang thiếu** → NHẬN. Áp vào template, bump version,
  viết migration nếu đổi cấu trúc, thêm case vào \`tooling/test-hooks.mjs\`.

${diffs.length ? diffs.map(d => `- [ ] \`${d.rel}\`${d.note ? ` — ${d.note}` : ` — ~${d.lines} dòng đổi`}
      diff: \`mechanism-diffs/${d.rel}.diff\``).join('\n') : '_(không có — project chưa sửa file cơ chế nào. Đây là dấu hiệu TỐT.)_'}

## Artifact (${artifacts.size})

${[...artifacts].map(a => `- [ ] \`${a}\` — ĐỌC CODE trước khi copy. Hook chạy với đầy quyền của bạn.`).join('\n') || '_(không có)_'}
`, 'utf8');

ok.push(`${lessons.length} bài học + ${evalFiles.size} gate + ${artifacts.size} artifact + ${diffs.length} diff cơ chế`);
ok.push(`→ ${DEST}`);
ok.push(`ĐỌC TIẾP ở template: knowledge/incoming/${projectId}/CONTRIB.md`);
warn.push('Không có gì được áp dụng tự động. Đây là cố ý.');
if (modified.length) {
  warn.push(`${modified.length} file cơ chế đã sửa: mỗi file là tuỳ biến đặc thù (chuyển ra hook riêng) hoặc cải tiến chung (đóng góp). Xem docs/MIGRATION.md §"Nếu bạn đã lỡ sửa nhiều file cơ chế".`);
}

// Dấu vết lần gửi cuối — `entropy-scan` đọc nó. Không có nó, "quên gửi lên" là trạng
// thái KHÔNG QUAN SÁT ĐƯỢC: nó không có triệu chứng nào ở project này, chỉ có hậu quả ở
// project TIẾP THEO của bạn (khởi động lại từ đúng số bài học seed).
try {
  writeFileSync(join(stateDir(), 'upstream-last.json'),
    JSON.stringify({ at: new Date().toISOString(), template: remoteUrl ?? TPL, lessons: lessons.length }, null, 2) + '\n', 'utf8');
} catch {}

if (remoteUrl) {
  console.log(`
  Template là bản clone TẠM ở ${TPL}. Ba lệnh để đưa đóng góp này lên, BẠN chạy:

    cd ${TPL}
    git checkout -b contrib/${projectId}-$(date +%Y%m%d) && git add knowledge/incoming && git commit -m "contrib(${projectId}): bài học + gate + diff cơ chế"
    git push -u origin HEAD && gh pr create --fill

  Script này KHÔNG push và KHÔNG mở PR — cố ý. Ghi vào template là đường supply-chain vào
  MỌI project khác; cổng đó phải có NGƯỜI, và review PR chính là cổng đó.
`);
}

process.exit(report('UPSTREAM', { ok, warn, fail }) ? 0 : 1);
