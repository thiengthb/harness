#!/usr/bin/env node
/**
 * Quét file staged trước khi commit — tầng ~giây của thang độ trễ phản hồi.
 *
 * Bắt những thứ mà hook PostToolUse có thể bỏ lọt (file do người sửa tay,
 * file đến từ merge, file agent tạo bằng lệnh shell thay vì tool Write).
 *
 *   node tooling/precommit-scan.mjs          ← .githooks/pre-commit, quét file STAGED
 *   node tooling/precommit-scan.mjs --all    ← ci.yml, quét mọi file ĐƯỢC TRACK
 *
 * VÌ SAO CÓ `--all`. Ở CI không có gì staged, nên bản chỉ-staged `exit 0` NGAY — một
 * lưới an toàn cuối luôn xanh vì nó không bao giờ có gì để xem. Bước "Quét secret"
 * trong ci.yml trước 2.1.0 là `echo "CHANGEME: gitleaks detect"`, tức là một dấu tick
 * xanh chứng minh SỐ KHÔNG, trong một job có tên `security`.
 *
 * Quét `git ls-files` (file được TRACK), không quét cây thư mục: thứ chưa track thì
 * chưa vào lịch sử, còn `node_modules/` thì không phải của bạn. Đây cũng là lý do
 * `--all` không thay được một scanner chuyên dụng — nó không có phân tích entropy và
 * không đọc được lịch sử git. Nó là **tầng rẻ nhất chạy được ở mọi repo không cần cài gì**.
 */
import { readFileSync, existsSync } from 'node:fs';
import { git, repoPath, toRepoRel, matchAny, pathsFor, report } from './lib/harness.mjs';

const ALL = process.argv.includes('--all');
const staged = ALL
  ? git(['ls-files']).stdout.split('\n').filter(Boolean)
  : git(['diff', '--cached', '--name-only', '--diff-filter=ACM']).stdout.split('\n').filter(Boolean);
if (!staged.length && !ALL) process.exit(0);

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
  // Chỉ có nghĩa khi đang COMMIT. Ở `--all` thì mọi file harness đều khớp, và một
  // cảnh báo nổ trên mọi file là cảnh báo dạy người ta ngừng đọc output.
  if (!ALL && matchAny(rel, pathsFor('harness'))) {
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

if (!fail.length && !warn.length) ok.push(`${staged.length} file ${ALL ? 'được track' : 'staged'}, sạch`);

if (!report(ALL ? 'QUÉT SECRET — TOÀN BỘ FILE ĐƯỢC TRACK' : 'PRE-COMMIT', { ok, warn, fail })) {
  console.error('Bỏ qua trong trường hợp khẩn: git commit --no-verify (và ghi lý do vào PR).\n');
  process.exit(1);
}
