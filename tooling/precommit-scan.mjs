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
import { git, repoPath, toRepoRel, matchAny, pathsFor, report, SECRET_PATTERNS, isSolo } from './lib/harness.mjs';

const ALL = process.argv.includes('--all');
const staged = ALL
  ? git(['ls-files']).stdout.split('\n').filter(Boolean)
  : git(['diff', '--cached', '--name-only', '--diff-filter=ACM']).stdout.split('\n').filter(Boolean);
if (!staged.length && !ALL) process.exit(0);

const fail = [], warn = [], ok = [];

/** Đuôi file NGUỒN — những file mà con người ĐỌC và REVIEW. Một byte NUL ở đây là lỗi, không phải "binary". */
const SOURCE_EXT = /\.(mjs|cjs|js|jsx|ts|tsx|md|json|ya?ml|toml|css|scss|html|sql|sh|ps1|txt)$/i;

// SECRET_PATTERNS ở `lib/harness.mjs` — MỘT nguồn. Bản cũ ở đây có 5 pattern trong khi
// `block-secrets.mjs` có 7: thiếu Slack token và JWT. Và tầng NÀY là tầng duy nhất thấy
// thứ NGƯỜI gõ tay (hook PreToolUse chỉ thấy thứ agent ghi), nên hai pattern thiếu ở đây
// là một lỗ thật, không phải một sự bất đối xứng vô hại.

for (const f of staged) {
  const rel = toRepoRel(f);

  if (matchAny(rel, pathsFor('secrets'))) {
    fail.push(`${rel}: file secret không được commit`);
    continue;
  }
  // Chỉ có nghĩa khi đang COMMIT. Ở `--all` thì mọi file harness đều khớp, và một
  // cảnh báo nổ trên mọi file là cảnh báo dạy người ta ngừng đọc output.
  if (!ALL && matchAny(rel, pathsFor('harness'))) {
    // SOLO THÌ CODEOWNERS LÀ NGHI THỨC RỖNG. Đo ở `sakubun-single-user`: 10/10 dòng
    // `.github/CODEOWNERS` trỏ về cùng một người, và `project.dri` cũng là người đó —
    // "cần review của CODEOWNERS" đọc ra là "tự review chính mình". Trên GitHub, solo còn
    // KHÔNG approve được PR của chính mình, nên câu đó mô tả một bước không thực hiện được.
    //
    // GIỮ file CODEOWNERS (nó có giá trị ngày project có người thứ hai), chỉ đổi CÂU NHẮC.
    // Phần còn lại của dòng — cập nhật `whats-new.md` — đúng ở cả hai vai và không đổi.
    warn.push(`${rel}: đang đổi HARNESS`
      + (isSolo() ? '' : ' của team → cần review của CODEOWNERS')
      + ` → cập nhật .claude/whats-new.md`);
  }

  const abs = repoPath(rel);
  if (!existsSync(abs)) continue;
  let content = '';
  try { content = readFileSync(abs, 'utf8'); } catch { continue; }   // binary → bỏ qua

  // ── NUL trong một file NGUỒN: hỏng theo cách mọi cái máy đều nói "ổn" ──────
  //
  // Xảy ra thật 2026-08-05, và nó ĐÃ SHIP: một separator viết thành byte NUL thật trong
  // `tooling/harness-doctor.mjs` đi qua PR #27, qua 7 job CI trên 3 OS, ra tag v2.9.0, rồi
  // sang cả BA repo tiêu thụ. Không có gì bắt được:
  //   · `node --check` XANH — NUL nằm trong một template literal, JS hợp lệ.
  //   · `test-hooks`, `test-migrations`, `entropy-scan`, `apply-to --audit` XANH.
  //   · Chính dòng `includes('\u0000') → continue` cũ Ở ĐÂY coi nó là "file binary, bỏ qua"
  //     — tức lớp quét secret cũng thôi đọc file đó.
  //
  // Thứ nó phá là kênh mà không cái máy nào đo: `git diff` in "Binary files differ", nên file
  // KHÔNG REVIEW ĐƯỢC nữa; `grep`/`rg` bỏ qua nó, nên nó VÔ HÌNH với mọi lần tìm code. Tôi
  // phát hiện chỉ vì `rg` bất ngờ trả về rỗng trên một file 650 dòng.
  //
  // Nên: với file có đuôi NGUỒN, một byte NUL là FAIL — không phải "bỏ qua vì binary".
  // Cách phân biệt là ĐUÔI FILE, không phải nội dung: "trông như binary" chính là triệu chứng.
  if (content.includes('\u0000')) {
    if (SOURCE_EXT.test(rel)) {
      fail.push(`${rel}: có byte NUL trong file NGUỒN — \`git diff\` sẽ in "Binary files differ" và file này `
        + `KHÔNG REVIEW ĐƯỢC nữa; \`grep\`/\`rg\` cũng bỏ qua nó.\n`
        + `         \`node --check\` vẫn xanh nên không test nào bắt được. Sửa: thay byte NUL bằng escape \`\\u0000\`.`);
    }
    continue;   // đã báo (hoặc đúng là file binary) → không quét secret theo dòng nữa
  }

  // Quét THEO DÒNG để hỗ trợ marker miễn trừ.
  //
  // Fixture của chính secret scanner luôn chứa chuỗi hình-dạng-secret — đó là
  // false positive không tránh được. Miễn trừ per-dòng, tường minh, audit được;
  // KHÔNG allowlist cả file, và KHÔNG nới lỏng pattern.
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/harness-allow-secret/.test(line)) continue;
    for (const { re, name } of SECRET_PATTERNS) {
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

// ── Commit NÂNG CẤP HARNESS đang mang theo file sản phẩm ─────────────────────
//
// Một commit chạm `harness.version` là commit nâng cấp lớp harness — nó phải chứa ĐÚNG lớp
// đó. Xảy ra thật 2026-08-05: `git add -A` trong repo `sakubun` để nâng v2.7.9 → v2.7.10 và
// nó cuốn theo `e2e/_shots.spec.ts`, một file SẢN PHẨM do một phiên KHÁC đang viết. File đó
// chưa tồn tại lúc đọc `git status` và đã tồn tại lúc `git add` — vài giây là đủ.
//
// Đây là ca mà AGENTS.md dặn ("một PR một mục đích", "KHÔNG sửa file feature của issue khác")
// nhưng chưa có cơ chế nào cưỡng chế, và nó đúng chế độ hỏng tệ nhất: commit vẫn xanh, vẫn
// đọc như một bản nâng harness gọn gàng, và file của người khác biến mất khỏi cây làm việc
// của họ vào lịch sử của bạn.
//
// WARN chứ không FAIL: có commit nâng cấp hợp lệ mang theo thay đổi sản phẩm (ví dụ sửa
// consumer khi harness đổi public surface — AGENTS.md đòi sửa CÙNG PR). Nhưng nó phải được
// NÓI RA, vì lớp harness thì người ta đọc lướt.
if (!ALL && staged.some(f => toRepoRel(f) === 'harness.version')) {
  const HARNESS_LAYER = /^(\.claude\/|\.github\/|tooling\/|harness-migrations\/|evals\/|knowledge\/|docs\/(adr\/harness\/|MIGRATION\.md)|reservations\/|harness\.(version|config\.json)$|HARNESS-CHANGELOG\.md$|AGENTS\.md$|CLAUDE\.md$|\.gitignore$|\.gitattributes$|\.gitmessage$)/;
  const foreign = staged.map(toRepoRel).filter(r => !HARNESS_LAYER.test(r));
  if (foreign.length) {
    warn.push(`commit này chạm \`harness.version\` (⇒ nâng cấp lớp harness) nhưng mang theo `
      + `${foreign.length} file NGOÀI lớp harness: ${foreign.slice(0, 5).join(' · ')}${foreign.length > 5 ? ` … +${foreign.length - 5}` : ''}`
      + `\n         Nếu bạn vừa \`git add -A\`: một phiên KHÁC có thể đang viết trong worktree này. `
      + `Bỏ ra: \`git restore --staged <file>\`.`);
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
