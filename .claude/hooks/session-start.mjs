#!/usr/bin/env node
/**
 * Nghi thức khởi động + vệ sinh môi trường.   SessionStart hook
 *
 * Chữa bốn bệnh cùng lúc:
 *   1. "session sau không biết session trước làm gì"  → in định hướng
 *   2. "agent chạy nhầm repo/nhánh"                    → in pwd + branch + remote
 *   3. ".git/index.lock treo do agent crash"           → dọn CƠ HỌC
 *   4. "nửa team hành xử theo rule cũ"                 → /whats-new một lần
 *
 * Hook này CHỈ IN, không chặn. Output phải NGẮN.
 */
import { readFileSync, writeFileSync, statSync, unlinkSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, repoPath, git, currentBranch, issueFromBranch, config, limit, readJson, writeJson, exists } from '../../tooling/lib/harness.mjs';

const lines = [];

// ── 1. Định vị ───────────────────────────────────────────────────────────────
const branch = currentBranch();
const issue = issueFromBranch(branch);
const remote = git(['remote', 'get-url', 'origin']).stdout || '(không có remote)';
lines.push(`📍 ${REPO_ROOT}`);
lines.push(`   branch: ${branch || '(detached)'}${issue ? `  ·  issue: ${issue}` : ''}`);
lines.push(`   origin: ${remote}`);

// ── 2. Dọn .git/index.lock treo ──────────────────────────────────────────────
try {
  const lock = repoPath('.git', 'index.lock');
  if (existsSync(lock)) {
    const ageMin = (Date.now() - statSync(lock).mtimeMs) / 60000;
    if (ageMin > limit('staleLockMinutes', 5)) {
      unlinkSync(lock);
      lines.push(`🧹 đã dọn .git/index.lock treo ${Math.round(ageMin)} phút (agent trước crash giữa lệnh git)`);
    } else {
      lines.push(`⚠️  .git/index.lock đang tồn tại (${Math.round(ageMin)} phút) — có session khác đang chạy?`);
    }
  }
} catch {}

// ── 3. Tình trạng công việc ──────────────────────────────────────────────────
const log = git(['log', '--oneline', '-5']).stdout;
if (log) lines.push('📜 5 commit gần nhất:\n' + log.split('\n').map(l => '   ' + l).join('\n'));

if (issue) {
  const progress = repoPath('docs', 'progress', `${issue}.md`);
  lines.push(exists(progress)
    ? `📓 nhật ký: docs/progress/${issue}.md — ĐỌC TRƯỚC KHI SỬA GÌ`
    : `📓 chưa có docs/progress/${issue}.md — chạy /claim để tạo`);
}

// ── 4. Cảnh báo worktree tích tụ ─────────────────────────────────────────────
try {
  const wt = git(['worktree', 'list', '--porcelain']).stdout;
  const count = (wt.match(/^worktree /gm) || []).length;
  const max = limit('maxWorktrees', 4);
  if (count > max) lines.push(`⚠️  ${count} worktree đang tồn tại (trần ${max}). Chạy /wt để dọn — ổ cứng và file-watcher sẽ cạn.`);
} catch {}

// ── 5. Reservation của người khác trên vùng nóng ─────────────────────────────
try {
  const dir = repoPath('reservations');
  if (existsSync(dir)) {
    const now = Date.now();
    const active = readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => readJson(join(dir, f)))
      .filter(r => r && new Date(r.expires).getTime() > now);
    if (active.length) {
      lines.push('🔒 vùng đang được đặt chỗ:');
      for (const r of active) lines.push(`   ${r.owner}: ${(r.files || []).join(', ')} — ${r.reason || ''}`);
    }
  }
} catch {}

// ── 6. /whats-new một lần cho mỗi version ────────────────────────────────────
try {
  const wn = repoPath('.claude', 'whats-new.md');
  if (existsSync(wn)) {
    const body = readFileSync(wn, 'utf8');
    const version = (body.match(/<!--\s*version:\s*([^\s>]+)\s*-->/) || [])[1];
    const statePath = repoPath('.claude', 'state', 'whats-new-seen.json');
    const seen = readJson(statePath, {});
    if (version && seen.version !== version) {
      const excerpt = body.replace(/<!--[\s\S]*?-->/g, '').trim().slice(0, 700);
      lines.push('\n📢 HARNESS ĐÃ ĐỔI (đọc một lần):\n' + excerpt);
      writeJson(statePath, { version, seenAt: new Date().toISOString() });
    }
  }
} catch {}

// ── 7. Nhắc nghi thức ────────────────────────────────────────────────────────
const c = config();
lines.push('');
lines.push(`▶️  Nghi thức: bắt đầu bằng /claim · kết thúc bằng /handoff · trước PR chạy /pre-merge`);
lines.push(`   Trần song song: ${limit('maxSessionsPerPerson', 2)} session/người. Không tự sửa .claude/settings.json — dùng /harness-propose.`);
if (!c.commands?.verify && !c.commands?.test) {
  lines.push(`   ⚠️  harness.config.json chưa khai báo lệnh verify/test — gate đang rỗng. Đây là việc số 1 cần làm.`);
}

console.log(lines.join('\n'));
process.exit(0);
