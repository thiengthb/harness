#!/usr/bin/env node
/**
 * Nạp một pack trí tuệ từ repo khác.
 *
 *   node tooling/knowledge/import.mjs ../repo-cu/.harness-pack
 *   node tooling/knowledge/import.mjs https://github.com/org/harness-pack --ref v1.4.0
 *
 * NGUYÊN TẮC AN TOÀN: script này KHÔNG BAO GIỜ ghi vào .claude/, AGENTS.md,
 * hay harness.config.json. Mọi thứ vào knowledge/incoming/ + một báo cáo.
 * Người xem, rồi mới áp dụng từng mục.
 *
 * Lý do: pack đến từ repo khác. Một pack ghi thẳng vào cấu hình harness là
 * một đường supply-chain vào chính lớp kiểm soát của bạn.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseFrontmatter } from '../lib/frontmatter.mjs';
import { repoPath, readJson, report, exists, run, config, guardFlags } from '../lib/harness.mjs';

guardFlags(process.argv.slice(2), { valued: ['--ref'] }, { name: 'knowledge/import.mjs' });

const args = process.argv.slice(2);
const source = args.find(a => !a.startsWith('--'));
const ref = (() => { const i = args.indexOf('--ref'); return i > -1 ? args[i + 1] : ''; })();

if (!source) {
  console.error(`Cách dùng:
  node tooling/knowledge/import.mjs <đường-dẫn-pack>
  node tooling/knowledge/import.mjs <git-url> --ref <tag|sha>

Luôn pin theo tag hoặc sha. Pin \`main\` = một commit sai làm hỏng đồng thời mọi repo.`);
  process.exit(1);
}

const ok = [], warn = [], fail = [];

// ── Lấy pack về ──────────────────────────────────────────────────────────────
let packDir = source;
let cleanup = null;

if (/^(https?:\/\/|git@)/.test(source)) {
  if (!ref) warn.push('Không có --ref: đang lấy nhánh mặc định. Nên pin theo tag/sha.');
  const tmp = join(tmpdir(), `harness-pack-${Date.now()}`);
  const clone = run('git', ['clone', '--depth', '1', ...(ref ? ['--branch', ref] : []), source, tmp]);
  if (clone.status !== 0) { console.error(clone.stderr); process.exit(1); }
  cleanup = tmp;
  packDir = exists(join(tmp, 'pack.json')) ? tmp : join(tmp, '.harness-pack');
}

const manifest = readJson(join(packDir, 'pack.json'));
if (!manifest) {
  console.error(`Không tìm thấy pack.json trong ${packDir}`);
  process.exit(1);
}

// ── So với thứ đã có ─────────────────────────────────────────────────────────
const localDir = repoPath('knowledge', 'lessons');
const strip = e => String(e).replace(/^\s*(\[[^\]]*\]\s*)+/, '').trim();
const localByTitle = new Map();
const localIds = new Set();
if (exists(localDir)) {
  for (const f of readdirSync(localDir).filter(f => f.endsWith('.md'))) {
    const { data } = parseFrontmatter(readFileSync(join(localDir, f), 'utf8'));
    if (data.title) {
      localByTitle.set(String(data.title).toLowerCase().trim(), {
        id: data.id,
        evidence: new Set((Array.isArray(data.evidence) ? data.evidence : []).map(strip)),
      });
    }
    if (data.id) localIds.add(String(data.id));
  }
}

const INCOMING = repoPath('knowledge', 'incoming', manifest.pack || 'pack');
rmSync(INCOMING, { recursive: true, force: true });
mkdirSync(join(INCOMING, 'lessons'), { recursive: true });

const fresh = [], mergeable = [], dupes = [], idClash = [];

for (const f of readdirSync(join(packDir, 'lessons')).filter(f => f.endsWith('.md'))) {
  const raw = readFileSync(join(packDir, 'lessons', f), 'utf8');
  const { data } = parseFrontmatter(raw);
  const title = String(data.title || '').toLowerCase().trim();
  const hit = localByTitle.get(title);

  // BA RỔ, KHÔNG PHẢI HAI.
  // Bản trước chỉ có "mới" và "trùng → bỏ". Nhưng "trùng tiêu đề mà có bằng chứng
  // MỚI" là ca GIÁ TRỊ NHẤT của cả cơ chế: nó là cách duy nhất một bài học
  // universal đủ ngưỡng "2 lần độc lập" — vì bài học càng universal thì càng phân
  // tán mỏng, mỗi repo chỉ gặp một lần. Bỏ rổ này đi là tự vô hiệu hoá ngưỡng.
  if (hit) {
    const newEvidence = (Array.isArray(data.evidence) ? data.evidence : [])
      .filter(e => !hit.evidence.has(strip(e)));
    if (!newEvidence.length) { dupes.push(data.title); continue; }
    writeFileSync(join(INCOMING, 'lessons', f), raw, 'utf8');
    mergeable.push({ id: data.id, title: data.title, file: f, mergeId: hit.id, newEvidence });
    continue;
  }

  if (localIds.has(String(data.id))) idClash.push(`${data.id} (${data.title})`);

  writeFileSync(join(INCOMING, 'lessons', f), raw, 'utf8');
  fresh.push({ id: data.id, title: data.title, scope: data.scope, representation: data.representation, file: f });
}

for (const sub of ['artifacts', 'evals']) {
  if (exists(join(packDir, sub))) cpSync(join(packDir, sub), join(INCOMING, sub), { recursive: true });
}
// Giữ pack.json: accept.mjs đọc nó để gắn provenance (bài học này từ repo nào,
// commit nào). Mất provenance ở bước đầu thì lần review sau bạn đi tìm PR #123
// trong repo mình và không thấy gì.
try { cpSync(join(packDir, 'pack.json'), join(INCOMING, 'pack.json')); } catch {}

// ── Báo cáo có hành động ─────────────────────────────────────────────────────
const reviewPath = join(INCOMING, 'REVIEW.md');
writeFileSync(reviewPath, `# Review pack: ${manifest.pack}

Nguồn: **${manifest.sourceProject}** @ \`${manifest.sourceCommit}\`${ref ? ` (ref \`${ref}\`)` : ''}
Nạp lúc: ${new Date().toISOString()}
Vào repo: **${config().project?.id}**

> Không có gì được áp dụng tự động. Duyệt từng mục dưới đây.

## Bài học mới (${fresh.length})

${fresh.length ? fresh.map(l => `### ${l.id} — ${l.title}
- scope: \`${l.scope}\` · dạng: \`${l.representation}\`
- [ ] Còn đúng với repo NÀY không? (scope \`stack:*\` chỉ đúng nếu stack khớp)
- [ ] Nếu nhận:
      \`\`\`
      node tooling/knowledge/accept.mjs ${manifest.pack || 'pack'}/${l.file}
      \`\`\`
      (tự cấp id mới, gắn nguồn, đặt \`status: candidate\`)
- [ ] Nếu repo NÀY **đã có** bài học này — cộng bằng chứng độc lập thay vì tạo bản trùng:
      \`\`\`
      node tooling/knowledge/accept.mjs ${manifest.pack || 'pack'}/${l.file} --merge <id-có-sẵn>
      \`\`\`
- [ ] Nếu bỏ: \`node tooling/knowledge/accept.mjs ${manifest.pack || 'pack'}/${l.file} --reject "lý do"\`
- [ ] Nếu nó kèm artifact: DRI đọc code trước khi copy vào \`.claude/\` hoặc \`tooling/\`
`).join('\n') : '_(không có bài học mới)_'}

## Bằng chứng độc lập cho bài học ĐÃ CÓ (${mergeable.length})

Repo này đã có bài học này, nhưng pack mang bằng chứng mà bạn chưa có. Gộp vào —
đừng tạo bản trùng. Bằng chứng từ repo **độc lập** mạnh hơn hai lần trong cùng repo:
nó loại được giả thuyết "chỉ đặc thù repo này".

${mergeable.length ? mergeable.map(l => `### → gộp vào \`${l.mergeId}\` — ${l.title}
${l.newEvidence.map(e => `- ${e}`).join('\n')}
- [ ] \`node tooling/knowledge/accept.mjs ${manifest.pack || 'pack'}/${l.file} --merge ${l.mergeId}\`
`).join('\n') : '_(không có)_'}

## Đã có, không có gì mới — bỏ qua (${dupes.length})

${dupes.length ? dupes.map(d => `- ${d}`).join('\n') : '_(không có)_'}

${idClash.length ? `## ⚠️ Trùng id — phải cấp lại id trước khi nhận\n\n${idClash.map(i => `- ${i}`).join('\n')}\n` : ''}
## Artifact kèm theo (${(manifest.artifacts || []).length})

${(manifest.artifacts || []).map(a => `- [ ] \`${a}\` — đọc trước khi copy. Hook chạy với đầy quyền của bạn.`).join('\n') || '_(không có)_'}
`, 'utf8');

if (cleanup) rmSync(cleanup, { recursive: true, force: true });

ok.push(`${fresh.length} bài học mới → knowledge/incoming/${manifest.pack}/`);
if (mergeable.length) ok.push(`★ ${mergeable.length} bài học ĐÃ CÓ nhưng có bằng chứng độc lập mới → gộp được (xem REVIEW.md)`);
if (dupes.length) ok.push(`${dupes.length} bài học đã có, không có gì mới, bỏ qua`);
if (idClash.length) warn.push(`${idClash.length} id trùng — phải cấp lại trước khi nhận`);
ok.push(`ĐỌC TIẾP: ${reviewPath.replace(repoPath('') + '', '')}`);
warn.push('Không có gì được áp dụng tự động. Đây là cố ý.');

process.exit(report('KNOWLEDGE IMPORT', { ok, warn, fail }) ? 0 : 1);
