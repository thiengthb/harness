#!/usr/bin/env node
/**
 * Vệ sinh worktree. Chạy mỗi sáng.
 *
 *   node tooling/wt-clean.mjs            # chỉ báo cáo
 *   node tooling/wt-clean.mjs --apply    # xoá worktree đã merge và SẠCH
 *
 * Nợ worktree tích rất nhanh: 6 worktree = 6 lần node_modules = hết ổ cứng và
 * cạn file-watcher. Worktree treo cũng là nơi công việc đi chết.
 *
 * KHÔNG BAO GIỜ xoá worktree có thay đổi chưa commit — kể cả với --apply.
 */
import { git, run, report, limit, repoPath } from './lib/harness.mjs';

const APPLY = process.argv.includes('--apply');
const ok = [], warn = [], fail = [];

const porcelain = git(['worktree', 'list', '--porcelain']).stdout;
if (!porcelain) { console.log('Không có worktree.'); process.exit(0); }

const trees = [];
let cur = null;
for (const line of porcelain.split('\n')) {
  if (line.startsWith('worktree ')) { cur = { path: line.slice(9) }; trees.push(cur); }
  else if (line.startsWith('branch ') && cur) cur.branch = line.slice(7).replace('refs/heads/', '');
  else if (line === 'bare' && cur) cur.bare = true;
}

git(['fetch', 'origin', '--quiet']);
const merged = new Set(
  git(['branch', '--merged', 'origin/main', '--format=%(refname:short)']).stdout.split('\n').map(s => s.trim()).filter(Boolean)
);

const main = trees[0]?.path;
let removed = 0;

for (const t of trees) {
  if (t.bare || t.path === main) continue;
  const label = `${t.branch || '(detached)'}  ${t.path}`;

  const dirty = run('git', ['-C', t.path, 'status', '--porcelain']).stdout;
  if (dirty) {
    warn.push(`${label} — CÓ ${dirty.split('\n').length} thay đổi chưa commit, giữ lại`);
    continue;
  }
  const unpushed = run('git', ['-C', t.path, 'log', '--oneline', '@{u}..HEAD']).stdout;
  if (unpushed) {
    warn.push(`${label} — có commit chưa push, giữ lại`);
    continue;
  }
  if (t.branch && merged.has(t.branch)) {
    if (APPLY) {
      const r = run('git', ['worktree', 'remove', t.path]);
      if (r.status === 0) { run('git', ['branch', '-d', t.branch]); ok.push(`đã xoá ${label}`); removed++; }
      else fail.push(`không xoá được ${label}: ${r.stderr}`);
    } else {
      ok.push(`SẼ XOÁ (đã merge, sạch): ${label}`);
    }
  } else {
    ok.push(`giữ (chưa merge): ${label}`);
  }
}

if (APPLY) git(['worktree', 'prune']);

const live = trees.length - 1 - removed;
const max = limit('maxWorktrees', 4);
if (live > max) warn.push(`Còn ${live} worktree (trần ${max}). Đóng bớt session hoặc merge bớt PR.`);

if (!APPLY && ok.some(m => m.startsWith('SẼ XOÁ'))) {
  warn.push('Chạy lại với --apply để thực hiện.');
}

report('WORKTREE', { ok, warn, fail });
process.exit(0);
