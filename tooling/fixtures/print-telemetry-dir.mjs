#!/usr/bin/env node
/**
 * FIXTURE cho `tooling/test-hooks.mjs` — in ra `telemetryDir()` phân giải thành gì.
 *
 * `config()` memo hoá trong một process, và `telemetryDir()` đọc `project.id` từ đó, nên
 * mỗi ca phải là một process riêng. Đây là thứ để process đó in ra.
 *
 * In NHÃN chứ không in đường dẫn thô: đường dẫn chứa `tmpdir()` và thư mục repo, khác nhau
 * trên từng máy và từng OS. Test so nhãn thì tất định ở cả ba OS (Parity Contract); test so
 * đường dẫn thì đỏ trên máy người khác vì một lý do không liên quan tới thứ nó khẳng định.
 *
 * Là một FILE chứ không phải `node -e "…"` — cùng lý do với `lint-always-fails.mjs`
 * và `print-team.mjs`: nháy và ngoặc được cmd.exe, PowerShell và sh hiểu khác nhau.
 */
import { telemetryDir, TEST_TELEMETRY_DIR, repoPath } from '../lib/harness.mjs';

const d = telemetryDir();
const label = d === TEST_TELEMETRY_DIR ? 'TEST'
  : d === repoPath('.claude', 'telemetry') ? 'THẬT'
    : 'KHÁC';
console.log(label);
