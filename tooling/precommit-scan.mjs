#!/usr/bin/env node
/**
 * Quét file staged trước khi commit — tầng ~giây của thang độ trễ phản hồi.
 *
 * Bắt những thứ mà hook PostToolUse có thể bỏ lọt (file do người sửa tay,
 * file đến từ merge, file agent tạo bằng lệnh shell thay vì tool Write).
 */
import { readFileSync, existsSync } from 'node:fs';
import { git, repoPath, toRepoRel, matchAny, pathsFor, report } from './lib/harness.mjs';

const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACM']).stdout.split('\n').filter(Boolean);
if (!staged.length) process.exit(0);

const fail = [], warn = [], ok = [];

const SECRET_PATTERNS = [
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'API key dạng sk-'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub token'],
  [/(postgres|mysql|mongodb(\+srv)?):\/\/[^\s:@/]+:[^\s@/]+@/, 'connection string có mật khẩu'],
];

for (const f of staged) {
  const rel = toRepoRel(f);

  if (matchAny(rel, pathsFor('secrets'))) {
    fail.push(`${rel}: file secret không được commit`);
    continue;
  }
  if (matchAny(rel, pathsFor('harness'))) {
    warn.push(`${rel}: đang đổi HARNESS của team → cần review của CODEOWNERS + cập nhật .claude/whats-new.md`);
  }

  const abs = repoPath(rel);
  if (!existsSync(abs)) continue;
  let content = '';
  try { content = readFileSync(abs, 'utf8'); } catch { continue; }   // binary → bỏ qua
  if (content.includes('\u0000')) continue;

  // Quét THEO DÒNG để hỗ trợ marker miễn trừ.
  //
  // Fixture của chính secret scanner luôn chứa chuỗi hình-dạng-secret — đó là
  // false positive không tránh được. Miễn trừ per-dòng, tường minh, audit được;
  // KHÔNG allowlist cả file, và KHÔNG nới lỏng pattern.
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/harness-allow-secret/.test(line)) continue;
    for (const [re, name] of SECRET_PATTERNS) {
      if (re.test(line)) {
        fail.push(`${rel}:${i + 1}: phát hiện ${name}\n         Nếu đây là fixture test: thêm comment \`harness-allow-secret\` vào cuối dòng.`);
        break;
      }
    }
  }

  if (/\r\n/.test(content) && !/\.(bat|cmd|ps1)$/.test(rel)) {
    warn.push(`${rel}: có CRLF. Kiểm .gitattributes và \`git config core.autocrlf false\`.`);
  }
}

// Cảnh báo case-collision — lớp bug chỉ vỡ ở CI/Linux
const all = git(['ls-files']).stdout.split('\n').filter(Boolean);
const lower = new Map();
for (const f of all) {
  const k = f.toLowerCase();
  if (lower.has(k) && lower.get(k) !== f) fail.push(`case collision: "${f}" vs "${lower.get(k)}" — build sẽ vỡ chỉ ở Linux/CI`);
  lower.set(k, f);
}

if (!fail.length && !warn.length) ok.push(`${staged.length} file staged, sạch`);

if (!report('PRE-COMMIT', { ok, warn, fail })) {
  console.error('Bỏ qua trong trường hợp khẩn: git commit --no-verify (và ghi lý do vào PR).\n');
  process.exit(1);
}
