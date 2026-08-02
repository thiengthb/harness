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
import { hookInput, toolCommand, block, pass, telemetry, config } from '../../tooling/lib/harness.mjs';

const cmd = toolCommand(hookInput());
if (!cmd.trim()) pass();

const DENY = [
  { re: /git\s+push\s+[^|;&]*(-f\b|--force(?!-with-lease))/, why: 'ghi lại lịch sử chung', fix: 'dùng `git push --force-with-lease` trên nhánh của chính bạn' },
  { re: /git\s+reset\s+--hard/, why: 'phá thay đổi chưa commit', fix: 'commit hoặc `git stash` trước, rồi người thực hiện tay' },
  { re: /git\s+clean\s+-\w*[fd]\w*[fd]?/, why: 'xoá file untracked, không đường cứu', fix: 'chạy `git clean -nd` để xem trước, rồi người thực hiện tay' },
  { re: /git\s+checkout\s+--\s/, why: 'bỏ thay đổi working tree', fix: 'nếu chủ ý, người thực hiện tay và ghi lý do vào PR' },
  { re: /git\s+branch\s+-D\s+(main|master|develop|release\b)/, why: 'xoá nhánh chung', fix: 'không xoá nhánh chung từ session agent' },
  { re: /git\s+(rebase|push)\b[^|;&]*\borigin\/(main|master|develop)\b[^|;&]*--force/, why: 'viết lại nhánh chung', fix: 'không bao giờ' },
  { re: /\brm\s+-[rRf]{1,2}\w*\s+([/~]\S*|\.\s*$|\*\s*$)/, why: 'xoá không hồi phục ở gốc hoặc thư mục hiện tại', fix: 'nêu đường dẫn cụ thể, tương đối, và hẹp' },
  { re: /\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b/i, why: 'phá dữ liệu', fix: 'viết migration có rollback plan, chạy trên staging trước' },
  { re: /\b(kubectl|helm)\b[^|;&]*--context[= ]\S*prod/i, why: 'chạm production', fix: 'agent chỉ được chạm staging; người bấm nút prod' },
  { re: /terraform\s+apply[^|;&]*-auto-approve/, why: 'apply hạ tầng không review plan', fix: 'chạy `terraform plan`, đọc plan, rồi người apply' },
  { re: /\b(shutdown|reboot|mkfs|dd\s+if=)/, why: 'lệnh cấp hệ thống', fix: 'ngoài phạm vi của agent' },
  { re: /:\(\)\s*\{.*\|.*&.*\}\s*;/, why: 'fork bomb', fix: '—' },
];

const hit = DENY.find(d => d.re.test(cmd));
if (hit) {
  telemetry('gate-fails', ['dcg', hit.why, cmd.slice(0, 120)]);
  block(
    `lệnh phá hoại trong repo dùng chung (${hit.why}).\n   Lệnh: ${cmd.slice(0, 200)}`,
    `${hit.fix}. Nếu thật sự cần: người thực hiện tay và ghi lý do vào PR. Xem AGENTS.md §Git.`
  );
}

// Cảnh báo mềm (không chặn): thêm dependency không qua package manager
if (/\bpackage\.json\b/.test(cmd) && /(>>|>|sed\s+-i|tee)\s/.test(cmd)) {
  console.error('⚠️  Đang sửa package.json bằng shell. Dùng lệnh của package manager thay vì sửa tay.');
}

pass();
