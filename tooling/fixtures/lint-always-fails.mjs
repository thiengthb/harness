#!/usr/bin/env node
/**
 * FIXTURE cho `tooling/test-hooks.mjs` — KHÔNG phải linter của project nào.
 *
 * Mục đích DUY NHẤT: cho `post-edit-lint.mjs` một `commands.lintFix` **thất bại tất định**,
 * để khẳng định được nhánh CHẶN của nó. Trước 2.21.0 nhánh đó chưa từng được test: cả bốn ca
 * `post-edit-lint` đang có đều đi vào đường `pass()` (chưa khai lệnh · file không lint được ·
 * file generated · không có path). Tức phần hook thật sự LÀM GÌ ĐÓ chưa ai chứng minh là chạy.
 *
 * Vì sao là một file `.mjs` chứ không phải một chuỗi lệnh trong config: Parity Contract.
 * `node -e "process.exit(1)"` phải qua shell, và dấu nháy/ngoặc được cmd.exe, PowerShell và sh
 * hiểu khác nhau. Một đường dẫn file thì cả ba đọc giống nhau.
 */
console.error('lint fixture: cố tình thất bại');
process.exit(1);
