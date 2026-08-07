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
import { git, run, report, limit, repoPath, mergeState } from './lib/harness.mjs';

const APPLY = process.argv.includes('--apply');
const ok = [], warn = [], fail = [], unknown = [];

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
const mergedByGit = new Set(
  git(['branch', '--merged', 'origin/main', '--format=%(refname:short)']).stdout.split('\n').map(s => s.trim()).filter(Boolean)
);

// Phán đoán THUẦN nằm ở `mergeState` trong lib (cùng lý do tách như `budgetStatus`): file này
// là CLI có `process.exit(0)` ở top-level, nên `import` nó ở test sẽ giết tiến trình gọi —
// đúng bug #88 của `native-surface.mjs`, vá ở v2.38.1 một ngày trước.
const ask = (branch) => run('gh', ['pr', 'list', '--head', branch, '--state', 'merged', '--limit', '1', '--json', 'number,mergedAt']);
const stateOf = (branch) => mergeState(branch, { mergedSet: mergedByGit, ask });

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
  const m = stateOf(t.branch);

  // `@{u}` KHÔNG resolve được khi upstream đã bị xoá — và `gh pr merge --delete-branch` xoá
  // đúng nhánh đó. Bản trước chỉ đọc `stdout`, nên lỗi resolve ⇒ chuỗi rỗng ⇒ "không có commit
  // chưa push". Lại là một lỗi đọc thành câu trả lời dễ chịu. Có bằng chứng PR merged thì câu
  // hỏi này moot (mọi commit đã vào main qua squash); không có thì lỗi phải chặn việc xoá.
  const up = run('git', ['-C', t.path, 'log', '--oneline', '@{u}..HEAD']);
  if (up.status !== 0 && m.state !== 'merged') {
    unknown.push(`${label} — không resolve được upstream (${String(up.stderr || '').trim().split('\n')[0].slice(0, 60)}) `
      + 'nên KHÔNG biết có commit chưa push hay không. Giữ lại, và đây không phải "an toàn" — là chưa đo được');
    continue;
  }
  if (up.stdout) {
    warn.push(`${label} — có ${up.stdout.split('\n').length} commit chưa push, giữ lại`);
    continue;
  }

  if (m.state === 'merged') {
    if (!APPLY) { ok.push(`SẼ XOÁ (đã merge, sạch): ${label} — ${m.why}`); continue; }
    const r = run('git', ['worktree', 'remove', t.path]);
    if (r.status !== 0) { fail.push(`không xoá được ${label}: ${r.stderr}`); continue; }
    // `-d` TỪ CHỐI nhánh squash-merged (git không coi là đã merge), nên nó luôn thất bại ở
    // repo squash và để lại nhánh mồ côi. `-D` chỉ được dùng khi CÓ bằng chứng merged ở trên —
    // không bao giờ như một cách "cho chắc".
    const d = run('git', ['branch', '-d', t.branch]);
    if (d.status !== 0) run('git', ['branch', '-D', t.branch]);
    ok.push(`đã xoá ${label} — ${m.why}`);
    removed++;
    // Nhánh remote sống sót khi `--delete-branch` bỏ dở vì worktree đang giữ nhánh local.
    // Một nhánh remote không PR nào mở đọc y hệt việc bỏ quên, nên nói ra thay vì tự xoá.
    if (run('git', ['ls-remote', '--heads', 'origin', t.branch]).stdout.trim()) {
      warn.push(`${t.branch} — nhánh REMOTE vẫn còn dù PR đã merge. Xoá: git push origin --delete ${t.branch}`);
    }
  } else if (m.state === 'open') {
    ok.push(`giữ (chưa merge): ${label} — ${m.why}`);
  } else {
    unknown.push(`${label} — ${m.why}. KHÔNG kết luận được đã merge hay chưa, nên giữ lại`);
  }
}

if (APPLY) git(['worktree', 'prune']);

const live = trees.length - 1 - removed;
const max = limit('maxWorktrees', 4);
if (live > max) warn.push(`Còn ${live} worktree (trần ${max}). Đóng bớt session hoặc merge bớt PR.`);

if (!APPLY && ok.some(m => m.startsWith('SẼ XOÁ'))) {
  warn.push('Chạy lại với --apply để thực hiện.');
}

report('WORKTREE', { ok, warn, fail, unknown });
process.exit(0);
