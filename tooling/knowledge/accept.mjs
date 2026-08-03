#!/usr/bin/env node
/**
 * Nhận một bài học từ knowledge/incoming/ vào knowledge/lessons/.
 *
 *   node tooling/knowledge/accept.mjs --list
 *   node tooling/knowledge/accept.mjs <pack>/<file.md>                  nhận thành bài học mới
 *   node tooling/knowledge/accept.mjs <pack>/<file.md> --merge L0001    gộp vào bài học đã có
 *   node tooling/knowledge/accept.mjs <pack>/<file.md> --reject "lý do"
 *
 * VÌ SAO CẦN LỆNH NÀY
 *
 * `import.mjs` cố tình dừng ở `knowledge/incoming/` — pack đến từ repo khác, ghi
 * thẳng vào cấu hình harness là một đường supply-chain. Nhưng "dừng lại" mà không
 * có bước tiếp thì thành NGÕ CỤT: người ta phải copy file bằng tay, id trùng nhau,
 * và provenance (bài học này đến từ đâu) bị mất ngay bước đầu.
 *
 * `--merge` GIẢI MỘT NGHỊCH LÝ CẤU TRÚC
 *
 * Điều kiện promote là "xuất hiện ≥2 lần độc lập". Nhưng bài học càng UNIVERSAL thì
 * càng phân tán MỎNG: project A gặp một lần, project B gặp một lần, không ai đủ 2.
 * Nghĩa là luật đó lọc bỏ đúng những bài học đáng mang đi nhất.
 *
 * `--merge` cộng `evidence` và `occurrences` từ repo khác vào bài học có sẵn.
 * 1 + 1 = 2, và bằng chứng từ hai repo độc lập thì MẠNH HƠN hai lần trong cùng
 * một repo — vì nó đã loại được giả thuyết "đặc thù project này".
 *
 * KHÔNG BAO GIỜ ghi vào .claude/ hay tooling/. Artifact vẫn nằm ở incoming/ để
 * người đọc code trước khi copy. Hook chạy với đầy quyền của bạn.
 */
import { readdirSync, readFileSync, writeFileSync, appendFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseFrontmatter, stringifyFrontmatter } from '../lib/frontmatter.mjs';
import { repoPath, report, exists, config, run } from '../lib/harness.mjs';

const args = process.argv.slice(2);
const LIST = args.includes('--list');
const flag = (n) => { const i = args.indexOf(n); return i > -1 ? args[i + 1] : null; };
const MERGE = flag('--merge');
const REJECT = flag('--reject');
const targetArg = args.find(a => !a.startsWith('--') && a !== MERGE && a !== REJECT);

const INCOMING = repoPath('knowledge', 'incoming');
const LESSONS = repoPath('knowledge', 'lessons');

// ── --list ───────────────────────────────────────────────────────────────────
function incomingLessons() {
  if (!exists(INCOMING)) return [];
  const out = [];
  for (const pack of readdirSync(INCOMING)) {
    const dir = join(INCOMING, pack, 'lessons');
    if (!exists(dir)) continue;
    for (const f of readdirSync(dir).filter(f => f.endsWith('.md'))) {
      const raw = readFileSync(join(dir, f), 'utf8');
      const { data } = parseFrontmatter(raw);
      out.push({ pack, file: f, ref: `${pack}/${f}`, data, raw, abs: join(dir, f) });
    }
  }
  return out;
}

if (LIST || !targetArg) {
  const items = incomingLessons();
  if (!items.length) {
    console.log('\nKhông có gì trong knowledge/incoming/.');
    console.log('Nạp pack: node tooling/knowledge/import.mjs <đường-dẫn|git-url> --ref <tag>\n');
    process.exit(0);
  }
  console.log(`\n=== ${items.length} BÀI HỌC CHỜ DUYỆT ===\n`);
  for (const i of items) {
    const age = Math.round((Date.now() - statSync(i.abs).mtimeMs) / 86400000);
    console.log(`  ${i.ref}`);
    console.log(`     ${i.data.title}`);
    console.log(`     scope: ${i.data.scope} · dạng: ${i.data.representation} · lần: ${i.data.occurrences ?? '?'} · chờ ${age} ngày`);
  }
  console.log(`
  Nhận mới:   node tooling/knowledge/accept.mjs <ref>
  Gộp:        node tooling/knowledge/accept.mjs <ref> --merge <id-bài-học-có-sẵn>
              ↑ dùng khi bài học NÀY đã có ở repo bạn. Cộng bằng chứng từ repo khác
                vào bài học sẵn có — đó là cách một bài học universal đủ ngưỡng 2 lần.
  Bỏ:         node tooling/knowledge/accept.mjs <ref> --reject "lý do"
`);
  process.exit(0);
}

// ── Tìm bài học được chỉ định ────────────────────────────────────────────────
const item = incomingLessons().find(i => i.ref === targetArg || i.file === targetArg);
if (!item) {
  console.error(`Không tìm thấy "${targetArg}" trong knowledge/incoming/. Chạy --list để xem.`);
  process.exit(1);
}

const ok = [], warn = [], fail = [];
const { data, body } = parseFrontmatter(item.raw);
const packManifest = (() => {
  try { return JSON.parse(readFileSync(join(INCOMING, item.pack, 'pack.json'), 'utf8')); } catch { return {}; }
})();
const originTag = `${packManifest.sourceProject || item.pack}@${packManifest.sourceCommit || '?'}`;

function decisionLog(action, note) {
  const line = [new Date().toISOString(), action, item.ref, originTag, note].join('\t') + '\n';
  try {
    appendFileSync(repoPath('knowledge', 'incoming', 'DECISIONS.log'), line, 'utf8');
  } catch (e) { warn.push(`không ghi được DECISIONS.log: ${e.message}`); }
}

// ── --reject ─────────────────────────────────────────────────────────────────
// Ghi lại quyết định BỎ, không chỉ xoá. Lần sau pack đó lại đến, bạn cần biết
// mình đã xem và đã từ chối — nếu không sẽ duyệt lại cùng một thứ mãi.
if (REJECT) {
  decisionLog('REJECT', REJECT);
  ok.push(`đã ghi quyết định BỎ: ${item.data.title}`);
  ok.push(`lý do: ${REJECT}`);
  ok.push('file vẫn ở incoming/ — xoá tay nếu muốn. DECISIONS.log giữ lịch sử.');
  process.exit(report('ACCEPT', { ok, warn, fail }) ? 0 : 1);
}

// ── --merge: cộng bằng chứng vào bài học có sẵn ───────────────────────────────
if (MERGE) {
  const localFile = readdirSync(LESSONS).filter(f => f.endsWith('.md') && !f.startsWith('_'))
    .find(f => parseFrontmatter(readFileSync(join(LESSONS, f), 'utf8')).data.id === MERGE);
  if (!localFile) { console.error(`Không có bài học id "${MERGE}" trong knowledge/lessons/.`); process.exit(1); }

  const lp = join(LESSONS, localFile);
  const local = parseFrontmatter(readFileSync(lp, 'utf8'));
  const ld = local.data;

  // CHỐNG LẠM PHÁT BẰNG CHỨNG (evidence laundering).
  // Bài học nảy vòng A→B→A: A xuất, B nhận rồi xác nhận rồi xuất lại, A gộp vào.
  // Nếu không lọc, bằng chứng GỐC CỦA A quay về A dưới nhãn của B và occurrences
  // tăng bằng chính dữ liệu của mình. Ngưỡng "2 lần độc lập" thành vô nghĩa.
  const myId = config().project?.id || '';
  const isMine = e => myId && new RegExp(`\\[${myId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@`).test(String(e));

  // So khớp theo NỘI DUNG, không theo nhãn. Bằng chứng gốc của repo này quay về
  // dưới nhãn `[project-b@sha]` là CÙNG MỘT dòng chữ — so nguyên chuỗi sẽ coi nó
  // là mới và đếm lại. Bóc mọi tiền tố `[...]` rồi mới so.
  const strip = e => String(e).replace(/^\s*(\[[^\]]*\]\s*)+/, '').trim();
  const existing = new Set((Array.isArray(ld.evidence) ? ld.evidence : []).map(strip));

  const raw = Array.isArray(data.evidence) ? data.evidence : [];
  const laundered = raw.filter(e => isMine(e) || existing.has(strip(e)));
  const added = raw
    .filter(e => !isMine(e) && !existing.has(strip(e)))
    .map(e => `[${originTag}] ${strip(e)}`);

  if (laundered.length) {
    warn.push(`bỏ ${laundered.length} bằng chứng đã có ở repo này (nảy vòng qua ${originTag} rồi về) — không đếm lại`);
  }

  if (!added.length) {
    warn.push('không có bằng chứng mới để cộng — pack này đã được gộp trước đó?');
    decisionLog('MERGE-NOOP', MERGE);
    process.exit(report('ACCEPT', { ok, warn, fail }) ? 0 : 1);
  }

  ld.evidence = [...(Array.isArray(ld.evidence) ? ld.evidence : []), ...added];
  const before = Number(ld.occurrences) || 0;
  // Cộng theo số bằng chứng THẬT SỰ thêm được, không theo `occurrences` mà pack tự khai.
  // Pack đến từ repo khác — con số trong đó không kiểm được, dòng bằng chứng thì kiểm được.
  ld.occurrences = before + added.length;

  // Bằng chứng từ repo ĐỘC LẬP mạnh hơn — ghi lại để review sau biết vì sao đủ ngưỡng.
  const repos = new Set((Array.isArray(ld['seen-in']) ? ld['seen-in'] : []).map(String));
  repos.add(config().project?.id || 'this-repo');
  repos.add(packManifest.sourceProject || item.pack);
  ld['seen-in'] = [...repos].sort();

  // Scope leo lên: thấy ở ≥2 repo độc lập thì "project" không còn đúng nữa.
  if (String(ld.scope) === 'project' && repos.size >= 2) {
    ld.scope = 'universal';
    warn.push(`scope: project → universal (đã thấy ở ${repos.size} repo độc lập). Kiểm lại: "xoá repo này, mục này còn giá trị không?"`);
  }

  writeFileSync(lp, stringifyFrontmatter(ld, local.body), 'utf8');
  decisionLog('MERGE', MERGE);

  ok.push(`gộp vào ${MERGE} (${localFile})`);
  ok.push(`occurrences: ${before} → ${ld.occurrences}`);
  ok.push(`+${added.length} bằng chứng, gắn nguồn [${originTag}]`);
  ok.push(`seen-in: ${ld['seen-in'].join(', ')}`);
  if (ld.occurrences >= 2 && before < 2) {
    ok.push('★ bài học này VỪA ĐỦ NGƯỠNG promote — chạy /knowledge-promote');
  }
  ok.push('Tiếp: node tooling/knowledge/lint.mjs');
  process.exit(report('ACCEPT', { ok, warn, fail }) ? 0 : 1);
}

// ── Nhận thành bài học mới ───────────────────────────────────────────────────
const usedIds = new Set();
let maxNum = 0;
for (const f of readdirSync(LESSONS).filter(f => f.endsWith('.md') && !f.startsWith('_'))) {
  const id = String(parseFrontmatter(readFileSync(join(LESSONS, f), 'utf8')).data.id || '');
  usedIds.add(id);
  const n = Number(id.replace(/\D/g, ''));
  if (Number.isFinite(n)) maxNum = Math.max(maxNum, n);
}
const newId = `L${String(maxNum + 1).padStart(4, '0')}`;

const d = { ...data };
d.id = newId;
// Provenance: bằng chứng đến từ repo khác thì phải NÓI RÕ, nếu không lần review sau
// bạn sẽ đi tìm PR #123 trong repo này và không thấy gì.
d.evidence = (Array.isArray(data.evidence) ? data.evidence : []).map(e => `[${originTag}] ${e}`);
d.origin = originTag;
d['seen-in'] = [packManifest.sourceProject || item.pack];
d.added = new Date().toISOString().slice(0, 10);
d.owner = config().project?.dri || d.owner || '@dri';

// Nhận từ repo khác nghĩa là ở repo NÀY nó chưa xảy ra lần nào → chưa đủ ngưỡng.
// Đặt status: candidate để lint không coi nó như bài học đã kiểm chứng tại đây.
d.status = 'candidate';

const slug = item.file.replace(/^\d+-/, '').replace(/\.md$/, '');
const destName = `${String(maxNum + 1).padStart(4, '0')}-${slug}.md`;
const dest = join(LESSONS, destName);
if (exists(dest)) { console.error(`${destName} đã tồn tại.`); process.exit(1); }

writeFileSync(dest, stringifyFrontmatter(d, body), 'utf8');
decisionLog('ACCEPT', newId);

ok.push(`${item.data.title}`);
ok.push(`→ knowledge/lessons/${destName}  (id ${newId}, status candidate)`);
ok.push(`nguồn: ${originTag}`);

const artifacts = (Array.isArray(data.artifacts) ? data.artifacts : []).map(a => String(a).split(' ')[0]);
const packArtifacts = artifacts.filter(a => exists(join(INCOMING, item.pack, 'artifacts', a)));
if (packArtifacts.length) {
  warn.push(`${packArtifacts.length} artifact KÈM THEO — KHÔNG được copy tự động:`);
  for (const a of packArtifacts) warn.push(`   knowledge/incoming/${item.pack}/artifacts/${a}  →  ${a}`);
  warn.push('   ĐỌC CODE trước khi copy. Hook và script chạy với đầy quyền của bạn.');
}

warn.push('status=candidate: bài học này chưa xảy ra ở repo NÀY lần nào.');
warn.push('   Gặp lần đầu ở đây → cập nhật evidence, đổi status: active.');
warn.push('   Nếu 3 tháng không gặp → nó không đúng với repo này, retire nó.');

ok.push('Tiếp: node tooling/knowledge/lint.mjs');
process.exit(report('ACCEPT', { ok, warn, fail }) ? 0 : 1);
