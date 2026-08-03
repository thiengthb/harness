#!/usr/bin/env node
/**
 * Đo kích thước harness.  Chỉ số NGƯỢC TRỰC GIÁC quan trọng nhất.
 *
 *   node tooling/harness-size.mjs [--baseline]
 *
 * Một harness đang TỐT LÊN thường đang NHỎ ĐI, vì mỗi bài học được đẩy xuống
 * dạng biểu diễn rẻ hơn (test, generator, hook) thay vì tích thành văn bản.
 *
 * Nếu số này đi lên trong khi bạn "cải thiện harness" → bạn đang phình harness,
 * không đang cải thiện nó.
 *
 * CỐ Ý KHÔNG ĐO `tooling/`. Chỉ số này đo phần ĐẮT của thang biểu diễn — prose
 * trong AGENTS.md, rule cứng, skill, hook. `tooling/` là đầu RẺ (computational
 * control): thêm 300 dòng script tất định để bỏ được 3 dòng rule cứng là một
 * thắng lợi, và một chỉ số phạt nó sẽ đẩy bạn đi sai hướng.
 * Nói rõ ở đây vì nếu không, người đọc sẽ tưởng harness không phình khi nó có phình.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { repoPath, readJson, writeJson, report, exists } from './lib/harness.mjs';

function walk(dir, filter = () => true) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out;
}

const lines = f => { try { return readFileSync(f, 'utf8').split('\n').length; } catch { return 0; } };
const sum = fs => fs.reduce((n, f) => n + lines(f), 0);

const md = p => extname(p) === '.md';

const metrics = {
  'AGENTS.md (dòng)': exists(repoPath('AGENTS.md')) ? lines(repoPath('AGENTS.md')) : 0,
  'rules (số file)': walk(repoPath('.claude/rules'), md).length,
  'rules (dòng)': sum(walk(repoPath('.claude/rules'), md)),
  'skills (số)': existsSync(repoPath('.claude/skills'))
    ? readdirSync(repoPath('.claude/skills'), { withFileTypes: true }).filter(d => d.isDirectory()).length : 0,
  'skills (dòng)': sum(walk(repoPath('.claude/skills'), md)),
  'agents (số)': walk(repoPath('.claude/agents'), md).length,
  'hooks (số)': walk(repoPath('.claude/hooks'), p => p.endsWith('.mjs')).length,
  'hooks (dòng)': sum(walk(repoPath('.claude/hooks'), p => p.endsWith('.mjs'))),
  'mcp servers': Object.keys(readJson(repoPath('.mcp.json'), {})?.mcpServers ?? {}).length,
  'lessons (số)': walk(repoPath('knowledge/lessons'), p => md(p) && !p.includes('_TEMPLATE')).length,
};

// Ngưỡng cảnh báo — không phải luật, là tín hiệu để đi đọc lại
const THRESHOLDS = {
  'AGENTS.md (dòng)': [150, 'Dài hơn 150 dòng: có thứ thuộc về rules/ (theo path), skill, hoặc hook'],
  'rules (dòng)': [400, 'Rule nhiều = thuế context ở mọi request. Rule nào không có `paths` frontmatter?'],
  'skills (số)': [12, 'Bằng chứng cộng đồng: ≤12 skill cho kết quả tốt hơn skill tràn lan'],
  'mcp servers': [5, '3–5 server/project. Tool definition ăn context mỗi request'],
};

const ok = [], warn = [];
for (const [k, v] of Object.entries(metrics)) {
  const t = THRESHOLDS[k];
  if (t && v > t[0]) warn.push(`${k}: ${v} (ngưỡng ${t[0]}) — ${t[1]}`);
  else ok.push(`${k}: ${v}`);
}

// So với baseline
const basePath = repoPath('.claude', 'state', 'harness-size-baseline.json');
if (process.argv.includes('--baseline')) {
  writeJson(basePath, { at: new Date().toISOString(), metrics });
  ok.push(`đã ghi baseline → ${basePath}`);
} else {
  const base = readJson(basePath);
  if (base) {
    const deltas = Object.entries(metrics)
      .map(([k, v]) => [k, v - (base.metrics[k] ?? 0)])
      .filter(([, d]) => d !== 0)
      .map(([k, d]) => `${k}: ${d > 0 ? '+' : ''}${d}`);
    if (deltas.length) {
      const grew = deltas.filter(d => d.includes('+')).length;
      (grew > deltas.length / 2 ? warn : ok).push(`so với baseline (${base.at.slice(0, 10)}): ${deltas.join(', ')}`);
      if (grew > deltas.length / 2) warn.push('Harness đang PHÌNH. Mỗi thay đổi promote phải kèm một đề xuất CẮT BỎ.');
    } else ok.push('không đổi so với baseline');
  } else {
    ok.push('chưa có baseline — chạy với --baseline để ghi');
  }
}

report('HARNESS SIZE', { ok, warn });
console.log('  Xu hướng tốt = PHẲNG HOẶC GIẢM. Xem knowledge/README.md.\n');
process.exit(0);
