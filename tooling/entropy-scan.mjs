#!/usr/bin/env node
/**
 * Phần MÁY KIỂM ĐƯỢC của /entropy-sweep.
 *
 *   node tooling/entropy-scan.mjs
 *
 * Harness không tự tốt lên theo thời gian — nó TỰ XẤU ĐI, vì codebase đổi và model
 * đổi mà tài liệu thì không. Không ai gửi thông báo khi một mảnh harness hết hạn.
 *
 * Script này tìm những dấu hiệu hết hạn mà máy phát hiện được. Phần cần phán đoán
 * ("mục này còn đúng không?") vẫn thuộc về skill /entropy-sweep và con người.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { parseFrontmatter } from './lib/frontmatter.mjs';
import { repoPath, config, limit, report, git, matchAny, pathsFor } from './lib/harness.mjs';

const ok = [], warn = [], fail = [];
const cfg = config();
const STALE_DAYS = limit('docStaleDays', 90);
const now = Date.now();
const daysAgo = d => (now - new Date(d).getTime()) / 86400_000;

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
const rel = p => p.replace(repoPath('') + '/', '').replace(repoPath(''), '');

// ── 1. Rule: thiếu paths / owner / expires-review ────────────────────────────
const GLOBAL_OK = ['danger-zones.md', 'README.md', '_TEMPLATE.md'];
for (const f of walk(repoPath('.claude', 'rules'), p => extname(p) === '.md')) {
  const name = f.split('/').pop();
  const { data } = parseFrontmatter(readFileSync(f, 'utf8'));
  if (GLOBAL_OK.includes(name)) continue;

  if (!data.paths) warn.push(`${rel(f)}: thiếu \`paths\` — thuế context cho MỌI người ở MỌI request`);
  if (!data.owner) warn.push(`${rel(f)}: thiếu \`owner\` — không ai chịu trách nhiệm`);
  if (!data['expires-review']) warn.push(`${rel(f)}: thiếu \`expires-review\` — sẽ không bao giờ bị xét lại`);
  else if (daysAgo(data['expires-review']) > 0) warn.push(`${rel(f)}: QUÁ HẠN review (${data['expires-review']})`);
  if (!data.why) warn.push(`${rel(f)}: thiếu \`why\` — rule là Ý KIẾN cho tới khi có số PR đứng sau`);
}

// ── 2. Bài học: quá hạn, hoặc ĐÃ ĐẠT điều kiện thoát ─────────────────────────
for (const f of walk(repoPath('knowledge', 'lessons'), p => extname(p) === '.md' && !p.includes('_TEMPLATE'))) {
  const { data } = parseFrontmatter(readFileSync(f, 'utf8'));
  if (data.status !== 'active') continue;
  const r = data['expires-review'];
  if (r && daysAgo(r) > 0) {
    warn.push(`${rel(f)}: quá hạn review (${r}) — ĐIỀU KIỆN THOÁT đã xảy ra chưa? → "${String(data['exit-condition']).slice(0, 80)}"`);
  }
  if (['rule', 'skill'].includes(String(data.representation)) && daysAgo(data.added) > 120) {
    warn.push(`${rel(f)}: dạng "${data.representation}" đã ${Math.round(daysAgo(data.added))} ngày — hạ xuống test/hook được chưa?`);
  }
  for (const a of (Array.isArray(data.artifacts) ? data.artifacts : [])) {
    const clean = String(a).split(' ')[0];
    if (clean.includes('/') && !existsSync(repoPath(clean))) {
      fail.push(`${rel(f)}: artifact "${clean}" KHÔNG TỒN TẠI — bài học trỏ vào hư không`);
    }
  }
}

// ── 3. Tài liệu quá hạn last-verified ────────────────────────────────────────
for (const f of walk(repoPath('docs'), p => extname(p) === '.md')) {
  const { data } = parseFrontmatter(readFileSync(f, 'utf8'));
  if (!data['last-verified']) continue;
  const d = daysAgo(data['last-verified']);
  if (d > STALE_DAYS) warn.push(`${rel(f)}: last-verified ${Math.round(d)} ngày trước (>${STALE_DAYS}) — VERIFY trước khi tin`);
}

// ── 4. Skill trỏ tới lệnh/file không tồn tại ─────────────────────────────────
const declaredCmds = new Set(Object.keys(cfg.commands || {}).filter(k => cfg.commands[k]));
for (const f of walk(repoPath('.claude', 'skills'), p => p.endsWith('SKILL.md'))) {
  const body = readFileSync(f, 'utf8');
  for (const m of body.matchAll(/node\s+((?:tooling|evals)\/[\w./-]+\.mjs)/g)) {
    if (!existsSync(repoPath(m[1]))) fail.push(`${rel(f)}: trỏ tới ${m[1]} — KHÔNG TỒN TẠI`);
  }
  for (const m of body.matchAll(/`commands\.(\w+)`/g)) {
    if (!declaredCmds.has(m[1]) && cfg.commands && !(m[1] in cfg.commands)) {
      warn.push(`${rel(f)}: nhắc tới commands.${m[1]} — không có trong harness.config.json`);
    }
  }
}

// ── 5. Skill / rule không được nhắc tới ở đâu (ứng viên gỡ bỏ) ───────────────
const allText = [...walk(repoPath('docs'), p => extname(p) === '.md'),
                 ...walk(repoPath('.claude'), p => extname(p) === '.md'),
                 repoPath('AGENTS.md'), repoPath('README.md')]
  .filter(existsSync).map(f => readFileSync(f, 'utf8')).join('\n');

const skillDirs = existsSync(repoPath('.claude', 'skills'))
  ? readdirSync(repoPath('.claude', 'skills'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name) : [];
for (const s of skillDirs) {
  const mentions = (allText.match(new RegExp(`/${s}\\b`, 'g')) || []).length;
  if (mentions <= 1) warn.push(`skill \`${s}\`: gần như không được nhắc tới ở đâu — ứng viên GỠ BỎ`);
}

// ── 6. Ngưỡng kích thước ─────────────────────────────────────────────────────
if (skillDirs.length > 12) {
  warn.push(`${skillDirs.length} skill (ngưỡng 12) — bằng chứng cộng đồng: ≤12 cho kết quả tốt hơn skill tràn lan. Bỏ bớt trước khi thêm.`);
}
const agentsLines = existsSync(repoPath('AGENTS.md')) ? readFileSync(repoPath('AGENTS.md'), 'utf8').split('\n').length : 0;
if (agentsLines > 150) warn.push(`AGENTS.md ${agentsLines} dòng (>150) — có thứ thuộc về rules/ (theo path), skill, hoặc hook`);

// ── 7. Hook đã đăng ký nhưng không có test ───────────────────────────────────
const settings = existsSync(repoPath('.claude', 'settings.json'))
  ? readFileSync(repoPath('.claude', 'settings.json'), 'utf8') : '';
const testsSrc = existsSync(repoPath('tooling', 'test-hooks.mjs'))
  ? readFileSync(repoPath('tooling', 'test-hooks.mjs'), 'utf8') : '';
for (const m of settings.matchAll(/hooks\/([\w-]+\.mjs)/g)) {
  if (!testsSrc.includes(m[1])) {
    fail.push(`hook ${m[1]} đã đăng ký nhưng KHÔNG CÓ TEST — code có quyền chặn công việc cả team mà không ai kiểm`);
  }
}

// ── 8. CHANGEME còn sót ──────────────────────────────────────────────────────
// Trong REPO TEMPLATE, CHANGEME là đúng — đó là placeholder cho project sẽ dùng nó.
// Trong PROJECT THẬT, CHANGEME nghĩa là harness chưa được cấu hình → gate không tồn tại.
const IS_TEMPLATE = existsSync(repoPath('HARNESS-CHANGELOG.md'))
  && existsSync(repoPath('tooling', 'apply-to.mjs'))
  && !existsSync(repoPath('.claude', 'harness-manifest.json'));

const changeme = [];
for (const f of ['harness.config.json', 'AGENTS.md', '.github/CODEOWNERS']) {
  if (existsSync(repoPath(f)) && readFileSync(repoPath(f), 'utf8').includes('CHANGEME')) changeme.push(f);
}
if (changeme.length) {
  if (IS_TEMPLATE) ok.push(`còn CHANGEME ở ${changeme.length} file — ĐÚNG, đây là repo template (placeholder cho project sẽ dùng)`);
  else fail.push(`còn CHANGEME: ${changeme.join(', ')} — harness CHƯA được cấu hình cho project này, gate không tồn tại`);
}

// ── 9. File harness bị sửa gần đây mà không cập nhật whats-new ───────────────
const since = new Date(now - 14 * 86400_000).toISOString().slice(0, 10);
const touched = git(['log', `--since=${since}`, '--name-only', '--pretty=format:']).stdout
  .split('\n').filter(Boolean).filter(f => matchAny(f, pathsFor('harness')));
if (touched.length) {
  const wnTouched = git(['log', `--since=${since}`, '--name-only', '--pretty=format:']).stdout.includes('.claude/whats-new.md');
  if (!wnTouched) warn.push(`${new Set(touched).size} file harness đổi trong 14 ngày nhưng .claude/whats-new.md KHÔNG đổi — nửa team đang hành xử theo rule cũ`);
}

if (!warn.length && !fail.length) ok.push('không phát hiện dấu hiệu hết hạn nào');

const good = report('ENTROPY SCAN', { ok, warn, fail });
console.log(`  Đây chỉ là phần MÁY kiểm được. Phần cần phán đoán ("mục này còn đúng
  với code hiện tại không?") thuộc về skill /entropy-sweep và con người.

  KHÔNG TỰ XOÁ gì. Đề xuất, người quyết định.\n`);
process.exit(good ? 0 : 1);
