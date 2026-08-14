#!/usr/bin/env node
/**
 * Đóng gói trí tuệ của repo này thành pack mang đi được.
 *
 *   node tooling/knowledge/export.mjs [--out .harness-pack] [--scopes universal,stack:*]
 *
 * Pack chứa: manifest, các lesson có scope mang đi được, và BẢN SAO của mọi
 * artifact mà lesson trỏ tới (hook, script, rule, skill). Không chứa gì thuộc
 * `scope: project` — thứ chỉ đúng ở đây thì mang đi là nhiễu.
 */
import { readdirSync, readFileSync, mkdirSync, cpSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parseFrontmatter } from '../lib/frontmatter.mjs';
import { repoPath, config, writeJson, report, exists, git, guardFlags } from '../lib/harness.mjs';

guardFlags(process.argv.slice(2), { valued: ['--out', '--scopes'] }, { name: 'knowledge/export.mjs' });

const args = process.argv.slice(2);
const argVal = (name, def) => {
  const i = args.indexOf(name);
  return i > -1 && args[i + 1] ? args[i + 1] : def;
};

const OUT = repoPath(argVal('--out', '.harness-pack'));
const cfg = config();
const wantScopes = argVal('--scopes', (cfg.knowledge?.exportScopes ?? ['universal', 'stack']).join(','))
  .split(',').map(s => s.trim()).filter(Boolean);

function scopeAllowed(scope) {
  return wantScopes.some(w =>
    w === scope || (w.endsWith('*') && scope.startsWith(w.slice(0, -1))) || (w === 'stack' && scope.startsWith('stack:'))
  );
}

const SRC = repoPath('knowledge', 'lessons');
if (!exists(SRC)) { console.error('Không có knowledge/lessons/'); process.exit(1); }

const ok = [], warn = [], fail = [];

mkdirSync(join(OUT, 'lessons'), { recursive: true });
mkdirSync(join(OUT, 'artifacts'), { recursive: true });
mkdirSync(join(OUT, 'evals'), { recursive: true });

const included = [];
const artifactSet = new Set();
const evalSet = new Set();

for (const f of readdirSync(SRC).filter(f => f.endsWith('.md') && !f.startsWith('_'))) {
  const raw = readFileSync(join(SRC, f), 'utf8');
  const { data } = parseFrontmatter(raw);
  if (data.status !== 'active') continue;
  if (!scopeAllowed(String(data.scope || 'project'))) continue;

  writeFileSync(join(OUT, 'lessons', f), raw, 'utf8');
  included.push({ id: data.id, file: f, title: data.title, scope: data.scope, representation: data.representation });

  // GATE ĐI THEO BÀI HỌC.
  // Bước 3 của vòng học ("gate") là bước không được bỏ — nhưng nếu pack chỉ mang
  // lesson + hook mà không mang eval task, bên nhận có cơ chế mà không có cách
  // kiểm cơ chế đó còn đúng ở repo họ hay không. Nhận tin không kiểm được thì
  // không phải là học.
  for (const e of (Array.isArray(data.evals) ? data.evals : [])) {
    const clean = String(e).split(' ')[0];
    const abs = repoPath(clean);
    if (!exists(abs)) { warn.push(`${f}: evals "${clean}" không tồn tại`); continue; }
    const dest = join(OUT, 'evals', clean);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(abs, dest);
    evalSet.add(clean);
  }
  if (!(Array.isArray(data.evals) && data.evals.length)
      && ['test', 'computational-control', 'generator'].includes(String(data.representation))) {
    warn.push(`${f}: dạng "${data.representation}" mà không có \`evals:\` — bên nhận sẽ không kiểm được`);
  }

  for (const a of (Array.isArray(data.artifacts) ? data.artifacts : [])) {
    // Chỉ copy artifact là file thật trong repo; mục dạng "AGENTS.md §Git" bỏ qua
    const clean = String(a).split(' ')[0];
    const abs = repoPath(clean);
    if (exists(abs)) {
      try {
        if (statSync(abs).isDirectory()) continue;
        const dest = join(OUT, 'artifacts', clean);
        mkdirSync(dirname(dest), { recursive: true });
        cpSync(abs, dest);
        artifactSet.add(clean);
      } catch (e) { warn.push(`không copy được artifact ${clean}: ${e.message}`); }
    } else {
      warn.push(`${f}: artifact "${clean}" không tồn tại — lesson trỏ vào hư không`);
    }
  }
}

if (!included.length) fail.push('Không có bài học nào mang đi được. Kiểm scope trong knowledge/lessons/*.md.');

const manifest = {
  pack: cfg.knowledge?.packName || 'harness-pack',
  sourceProject: cfg.project?.id || 'unknown',
  sourceCommit: git(['rev-parse', '--short', 'HEAD']).stdout || 'unknown',
  exportedAt: new Date().toISOString(),
  scopes: wantScopes,
  lessons: included,
  artifacts: [...artifactSet].sort(),
  evals: [...evalSet].sort(),
  harnessVersion: cfg.version ?? 1,
};
writeJson(join(OUT, 'pack.json'), manifest);

writeFileSync(join(OUT, 'INSTALL.md'), `# ${manifest.pack}

Pack trí tuệ xuất từ **${manifest.sourceProject}** (commit \`${manifest.sourceCommit}\`) ngày ${manifest.exportedAt.slice(0, 10)}.

- ${included.length} bài học
- ${artifactSet.size} artifact kèm theo

## Nạp vào repo khác

\`\`\`bash
node tooling/knowledge/import.mjs <đường-dẫn-tới-pack-này>
\`\`\`

Import **không** tự ghi vào \`.claude/\`. Nó đặt mọi thứ vào \`knowledge/incoming/\`
và in báo cáo để người xem trước. Một pack ghi thẳng vào cấu hình harness là một
đường leo thang quyền.

## Bài học trong pack

${included.map(l => `- \`${l.id}\` **${l.title}** — _${l.scope}_ · ${l.representation}`).join('\n')}
`, 'utf8');

ok.push(`${included.length} bài học + ${artifactSet.size} artifact + ${evalSet.size} gate → ${OUT}`);
ok.push('Tiếp theo: commit .harness-pack/ vào repo trung tâm, gắn TAG (đừng để repo khác pin `main`).');

process.exit(report('KNOWLEDGE EXPORT', { ok, warn, fail }) ? 0 : 1);
