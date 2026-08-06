#!/usr/bin/env node
/**
 * FIXTURE cho `tooling/test-hooks.mjs` — in trạng thái lớp phối hợp đọc từ `HARNESS_CONFIG`.
 *
 * `config()` được memo hoá trong một process, nên không thể lật `project.teamSize` giữa
 * chừng để kiểm bảng ba giá trị. Mỗi ca phải là một process riêng, và mỗi process cần một
 * thứ để in ra.
 *
 * Là một FILE chứ không phải `node -e "…"`: Parity Contract. Dấu nháy và ngoặc được
 * cmd.exe, PowerShell và sh hiểu khác nhau; một đường dẫn file thì cả ba đọc giống nhau.
 * (Cùng lý do với `lint-always-fails.mjs`.)
 */
import { teamSize, isSolo } from '../lib/harness.mjs';

console.log(`teamSize=${JSON.stringify(teamSize())} isSolo=${isSolo()}`);
