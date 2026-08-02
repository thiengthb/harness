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
import { repoPath, readJson, report, exists, run, config } from '../lib/harness.mjs';

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
const localTitles = new Set();
const localIds = new Set();
if (exists(localDir)) {
  for (const f of readdirSync(localDir).filter(f => f.endsWith('.md'))) {
    const { data } = parseFrontmatter(readFileSync(join(localDir, f), 'utf8'));
    if (data.title) localTitles.add(String(data.title).toLowerCase().trim());
    if (data.id) localIds.add(String(data.id));
  }
}

const INCOMING = repoPath('knowledge', 'incoming', manifest.pack || 'pack');
rmSync(INCOMING, { recursive: true, force: true });
mkdirSync(join(INCOMING, 'lessons'), { recursive: true });

const fresh = [], dupes = [], idClash = [];

for (const f of readdirSync(join(packDir, 'lessons')).filter(f => f.endsWith('.md'))) {
  const raw = readFileSync(join(packDir, 'lessons', f), 'utf8');
  const { data } = parseFrontmatter(raw);
  const title = String(data.title || '').toLowerCase().trim();

  if (localTitles.has(title)) { dupes.push(data.title); continue; }
  if (localIds.has(String(data.id))) idClash.push(`${data.id} (${data.title})`);

  writeFileSync(join(INCOMING, 'lessons', f), raw, 'utf8');
  fresh.push({ id: data.id, title: data.title, scope: data.scope, representation: data.representation, file: f });
}

if (exists(join(packDir, 'artifacts'))) {
  cpSync(join(packDir, 'artifacts'), join(INCOMING, 'artifacts'), { recursive: true });
}

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
- [ ] Nếu nhận: copy \`lessons/${l.file}\` → \`knowledge/lessons/\`, **cấp id mới**, cập nhật \`evidence\`
- [ ] Nếu nó kèm artifact: DRI đọc code trước khi copy vào \`.claude/\` hoặc \`tooling/\`
`).join('\n') : '_(không có bài học mới)_'}

## Đã có, bỏ qua (${dupes.length})

${dupes.length ? dupes.map(d => `- ${d}`).join('\n') : '_(không có)_'}

${idClash.length ? `## ⚠️ Trùng id — phải cấp lại id trước khi nhận\n\n${idClash.map(i => `- ${i}`).join('\n')}\n` : ''}
## Artifact kèm theo (${(manifest.artifacts || []).length})

${(manifest.artifacts || []).map(a => `- [ ] \`${a}\` — đọc trước khi copy. Hook chạy với đầy quyền của bạn.`).join('\n') || '_(không có)_'}
`, 'utf8');

if (cleanup) rmSync(cleanup, { recursive: true, force: true });

ok.push(`${fresh.length} bài học mới → knowledge/incoming/${manifest.pack}/`);
if (dupes.length) ok.push(`${dupes.length} bài học đã có, bỏ qua`);
if (idClash.length) warn.push(`${idClash.length} id trùng — phải cấp lại trước khi nhận`);
ok.push(`ĐỌC TIẾP: ${reviewPath.replace(repoPath('') + '', '')}`);
warn.push('Không có gì được áp dụng tự động. Đây là cố ý.');

process.exit(report('KNOWLEDGE IMPORT', { ok, warn, fail }) ? 0 : 1);
