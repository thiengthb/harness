#!/usr/bin/env node
/**
 * DCG — Destructive Command Guard.   PreToolUse trên Bash|PowerShell
 *
 * Trong repo dùng chung, một `git push --force` của một agent phá lịch sử của
 * MỌI NGƯỜI. Chỉ dẫn trong AGENTS.md không ngăn được; chỉ chặn cơ học mới ngăn được.
 *
 * `--force-with-lease` CỐ Ý không bị chặn: đó là biến thể an toàn và agent cần nó
 * để rebase nhánh của chính mình.
 */
import { hookInput, toolCommand, block, pass, telemetry, hookRan, config, declareFailMode, dangerousCommand, GIT_DISCARD_WHOLE_TREE, backtickEvalHazard } from '../../tooling/lib/harness.mjs';

declareFailMode(2, 'Không phân tích được lệnh nên không biết nó có phá lịch sử chung hay production hay không (nhóm 1+3).');

const cmd = toolCommand(hookInput());
if (!cmd.trim()) pass();

// `program` = rule này nói về CHƯƠNG TRÌNH nào. Có nó thì rule chỉ nổ khi một lệnh đơn có
// đúng chương trình đó — nên `gh issue create --body "…git push --force…"` KHÔNG còn bị chặn
// (chương trình là `gh`), còn `git "push" --force` thì CÓ (bỏ nháy rồi mới khớp).
//
// Không có `program` ⇒ quét toàn chuỗi đã bỏ heredoc. Dành cho nhóm mà thứ nguy hiểm nằm
// BÊN TRONG một đối số (SQL) hoặc không có chương trình cố định (fork bomb).
// Xem `dangerousCommand` ở `tooling/lib/harness.mjs` — kể cả phần nó KHÔNG bắt được.
const GIT = /^git$/;
const DENY = [
  // MỌI rule khớp trên CẢ lệnh đơn (đã bỏ nháy, chương trình đứng đầu) — một quy ước, không
  // hai. `program` chỉ để GÁC xem rule có được xét hay không.
  { program: GIT, re: /^git\s+push\s+[^|;&]*(-f\b|--force(?!-with-lease))/, why: 'ghi lại lịch sử chung', fix: 'dùng `git push --force-with-lease` trên nhánh của chính bạn' },
  { program: GIT, re: /^git\s+reset\s+--hard/, why: 'phá thay đổi chưa commit', fix: 'commit hoặc `git stash` trước, rồi người thực hiện tay' },
  { program: GIT, re: /^git\s+clean\s+-\w*[fd]\w*[fd]?/, why: 'xoá file untracked, không đường cứu', fix: 'chạy `git clean -nd` để xem trước, rồi người thực hiện tay' },
  // Regex ở `lib` — bảng ca của nó phải phân biệt `.` với `./src`, nên nó phải khẳng định vào
  // CHÍNH regex này chứ không vào một bản chép (#160). Có pathspec cụ thể ⇒ CHO QUA.
  { program: GIT, re: GIT_DISCARD_WHOLE_TREE, why: 'bỏ TOÀN BỘ thay đổi working tree',
    fix: 'muốn bỏ vài file thì NÊU TÊN chúng (`git checkout -- <file>` được phép); muốn bỏ cả cây thì người thực hiện tay và ghi lý do vào PR' },
  { program: GIT, re: /^git\s+branch\s+-D\s+(main|master|develop|release\b)/, why: 'xoá nhánh chung', fix: 'không xoá nhánh chung từ session agent' },
  { program: GIT, re: /^git\s+(rebase|push)\b[^|;&]*\borigin\/(main|master|develop)\b[^|;&]*--force/, why: 'viết lại nhánh chung', fix: 'không bao giờ' },
  { program: /^rm$/, re: /^rm\s+-[rRf]{1,2}\w*\s+([/~]\S*|\.\s*$|\*\s*$)/, why: 'xoá không hồi phục ở gốc hoặc thư mục hiện tại', fix: 'nêu đường dẫn cụ thể, tương đối, và hẹp' },
  { program: /^(kubectl|helm)$/, re: /--context[= ]\S*prod/i, why: 'chạm production', fix: 'agent chỉ được chạm staging; người bấm nút prod' },
  { program: /^terraform$/, re: /^terraform\s+apply[^|;&]*-auto-approve/, why: 'apply hạ tầng không review plan', fix: 'chạy `terraform plan`, đọc plan, rồi người apply' },
  { program: /^(shutdown|reboot|mkfs(\..+)?|dd)$/, re: /^(shutdown|reboot|mkfs|dd\s+if=)/, why: 'lệnh cấp hệ thống', fix: 'ngoài phạm vi của agent' },
  // `test:` thay vì `re:` — phán đoán này cần TRẠNG THÁI NHÁY, mà `re` khớp trên bản đã bỏ
  // nháy (#177). Backtick trong nháy ĐƠN được phép: bash không diễn giải gì trong `'…'`.
  { test: backtickEvalHazard, why: 'backtick trong đối số văn bản: bash THAY nó bằng output của lệnh',
    fix: 'dùng nháy ĐƠN cho đối số có backtick, hoặc — với văn bản nhiều dòng — dùng công cụ `Write` ghi một file `.mjs` rồi `node file.mjs`' },
  // KHÔNG có `program`: SQL nằm bên trong đối số của psql/mysql/bất kỳ client nào, và fork
  // bomb không có token chương trình nào để bám vào.
  { re: /\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b/i, why: 'phá dữ liệu', fix: 'viết migration có rollback plan, chạy trên staging trước' },
  { re: /:\(\)\s*\{.*\|.*&.*\}\s*;/, why: 'fork bomb', fix: '—' },
];

const hit = dangerousCommand(cmd, DENY);
if (hit) {
  telemetry('gate-fails', ['dcg', hit.why, cmd.slice(0, 120)]);
  block(
    `lệnh phá hoại trong repo dùng chung (${hit.why}).\n   Lệnh: ${cmd.slice(0, 200)}`,
    `${hit.fix}. Nếu thật sự cần: người thực hiện tay và ghi lý do vào PR. Xem AGENTS.md §Git.`
  );
}

// ĐO 2026-08-12 (#177): dòng dưới KHÔNG TỚI ĐƯỢC AGENT. Chạy hook trực tiếp thì nó in ra;
// chạy một lệnh Bash thật khớp đúng điều kiện thì không dòng nào xuất hiện trong kết quả công
// cụ. `console.error` + exit 0 ở PreToolUse là một kênh mà người gây ra lỗi không nghe thấy.
//
// KHÔNG XOÁ ở lô này — biến nó thành `block()` là THÊM một điều cấm, và đó là quyết định của
// DRI. Ghi phép đo lại đây để người sau không tưởng nó đang có tác dụng: một cơ chế vẫn chạy,
// vẫn tốn một nhánh, và không tới ai là đúng thứ `/harness-retro` bước 4 phải cắt.
//
// Cảnh báo mềm (không chặn): thêm dependency không qua package manager
if (/\bpackage\.json\b/.test(cmd) && /(>>|>|sed\s+-i|tee)\s/.test(cmd)) {
  console.error('⚠️  Đang sửa package.json bằng shell. Dùng lệnh của package manager thay vì sửa tay.');
}

hookRan('dcg', 'pass');
pass();
