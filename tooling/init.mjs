#!/usr/bin/env node
/**
 * MỘT lệnh bootstrap, chạy được trên Ubuntu / macOS / Windows.
 *
 *   node tooling/init.mjs
 *
 * Đây là chỗ DUY NHẤT trong repo BIẾT về sự khác biệt giữa các hệ điều hành.
 * Mọi nơi khác giả định môi trường đã chuẩn. Tập trung độ phức tạp vào một file
 * có chủ, thay vì rải nó vào 20 hook.
 *
 * `init.sh` là thiết kế chỉ-POSIX. Trong team đa OS nó có nghĩa là:
 * "harness của team không tồn tại với người dùng Windows" — và bạn sẽ không biết.
 */
import { existsSync, copyFileSync, readFileSync } from 'node:fs';
import { platform, cpus, totalmem } from 'node:os';
import { REPO_ROOT, repoPath, run, git, runConfigured, config, report, exists } from './lib/harness.mjs';

const ok = [], warn = [], fail = [];
const cfg = config();
const os = platform();
const isWSL = !!process.env.WSL_DISTRO_NAME || (() => {
  try { return /microsoft/i.test(readFileSync('/proc/version', 'utf8')); } catch { return false; }
})();

// ── 1. Toolchain — pin, không "khuyến nghị" ──────────────────────────────────
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 20) fail.push(`Node ${process.versions.node} — cần >= 20. Dùng mise/nvm/fnm.`);
else ok.push(`Node ${process.versions.node}`);

// ── 2. Cấu hình git chống conflict giả — SET TỰ ĐỘNG, không dựa vào ai nhớ ────
if (git(['rev-parse', '--git-dir']).status === 0) {
  const gitConf = [
    ['core.autocrlf', 'false'],   // để .gitattributes quyết định, không phải git
    ['core.eol', 'lf'],
    ['core.ignorecase', 'false'], // chống lớp bug: Button.tsx vs button.tsx vỡ chỉ ở CI
    ['pull.rebase', 'true'],
  ];
  for (const [k, v] of gitConf) run('git', ['config', k, v]);
  if (exists(repoPath('.gitmessage'))) run('git', ['config', 'commit.template', '.gitmessage']);

  // Hook pre-commit gọi guard reservation — cưỡng chế, không phải lời nhắc
  const hooksPath = run('git', ['config', 'core.hooksPath']).stdout;
  if (!hooksPath && exists(repoPath('.githooks'))) {
    run('git', ['config', 'core.hooksPath', '.githooks']);
    ok.push('core.hooksPath → .githooks (guard reservation + secret)');
  }
  ok.push('git config đã chuẩn hoá (autocrlf/eol/ignorecase/rebase)');
} else {
  warn.push('Chưa phải git repo — chạy `git init` rồi chạy lại.');
}

// ── 3. Cảnh báo môi trường đặc thù ───────────────────────────────────────────
if (os === 'win32') {
  if (REPO_ROOT.length > 60) warn.push(`Đường dẫn repo dài (${REPO_ROOT.length} ký tự) — nguy cơ lỗi 260 ký tự. Chuyển về C:\\dev\\`);
  if (/OneDrive|Desktop/i.test(REPO_ROOT)) fail.push('Repo nằm trong OneDrive/Desktop. OneDrive sync + node_modules = ác mộng. Chuyển ra C:\\dev\\ NGAY.');
  warn.push('Windows native: auto mode & sandbox chưa được hỗ trợ. Cân nhắc WSL2 — xem AGENTS.md §Parity Contract.');
  warn.push('Cần bật: Long Path (LongPathsEnabled=1) và Developer Mode (cho symlink).');
} else if (os === 'linux') {
  if (isWSL && /^\/mnt\/[a-z]\//.test(REPO_ROOT)) {
    fail.push('Repo nằm trên /mnt/c — I/O với node_modules cực chậm. Chuyển vào ~/dev/ trong filesystem của WSL.');
  }
  try {
    const w = Number(readFileSync('/proc/sys/fs/inotify/max_user_watches', 'utf8').trim());
    const need = 262144;
    if (w && w < need) warn.push(`inotify watches = ${w}. Nâng lên ${need} nếu dùng nhiều worktree (watcher sẽ chết).`);
    else ok.push(`inotify watches = ${w}`);
  } catch {}
}
if (cpus().length < 4 || totalmem() / 1e9 < 8) {
  warn.push(`Máy ${cpus().length} core / ${Math.round(totalmem() / 1e9)}GB RAM — giảm số session song song (xem limits.maxSessionsPerPerson).`);
}

// ── 4. Van xả áp — file cá nhân ──────────────────────────────────────────────
const pairs = [
  ['.claude/settings.local.example.json', '.claude/settings.local.json'],
  ['.env.example', '.env'],
];
for (const [src, dest] of pairs) {
  if (existsSync(repoPath(src)) && !existsSync(repoPath(dest))) {
    copyFileSync(repoPath(src), repoPath(dest));
    ok.push(`tạo ${dest} từ ${src} — SỬA nó, đừng sửa file của team`);
  }
}

// ── 5. Cấu hình harness đã điền chưa ─────────────────────────────────────────
if (String(cfg.project?.id).startsWith('CHANGEME')) {
  fail.push('harness.config.json → project.id vẫn là CHANGEME. Điền trước khi làm gì khác.');
}
const declared = Object.entries(cfg.commands || {}).filter(([, v]) => v && String(v).trim());
if (!declared.length) {
  fail.push('harness.config.json → commands rỗng. Gate đang không tồn tại và harness này chỉ là trang trí. Đây là việc SỐ 1.');
} else {
  ok.push(`${declared.length} lệnh đã khai: ${declared.map(([k]) => k).join(', ')}`);
  for (const need of ['verify', 'test', 'typecheck']) {
    if (!cfg.commands?.[need]) warn.push(`chưa khai commands.${need} — gate sẽ bỏ qua nó`);
  }
}

// ── 6. Cài + sinh code + smoke test ──────────────────────────────────────────
const steps = ['install', 'gen'];
for (const s of steps) {
  const r = runConfigured(s, { capture: false });
  if (r.skipped) { warn.push(`bỏ qua ${s} (chưa khai báo)`); continue; }
  if (r.status !== 0) fail.push(`${s} thất bại`);
  else ok.push(s);
}

const smoke = runConfigured('verify', { capture: false });
if (smoke.skipped) warn.push('bỏ qua verify (chưa khai báo) — không có smoke test');
else if (smoke.status !== 0) fail.push('verify thất bại — repo đang ở trạng thái hỏng TRƯỚC khi bạn làm gì');
else ok.push('verify xanh');

// ── 7. Kiểm hook chạy được trên máy này ──────────────────────────────────────
const hookTest = run('node', [repoPath('tooling', 'test-hooks.mjs')]);
if (hookTest.status !== 0) fail.push('hook không chạy đúng trên máy này — xem `node tooling/test-hooks.mjs`');
else ok.push('hook pass trên ' + os + (isWSL ? ' (WSL)' : ''));

// ── 8. Báo cáo ───────────────────────────────────────────────────────────────
const good = report('INIT REPORT', { ok, warn, fail });
if (!good) {
  console.log('Chưa sẵn sàng. Sửa các dòng FAIL rồi chạy lại `node tooling/init.mjs`.\n');
  process.exit(1);
}
console.log('Sẵn sàng. Chạy `claude` và đọc AGENTS.md (chỉ AGENTS.md).\n');
