#!/usr/bin/env node
/**
 * ALIAS ĐÃ ĐỔI TÊN — giữ đúng MỘT version (2.0.0), rồi xoá.
 *
 * `tooling/doctor.mjs` → `tooling/harness-doctor.mjs`.
 *
 * VÌ SAO ĐỔI: `/doctor` là lệnh NATIVE của Claude Code (nó chẩn đoán cài đặt và đề
 * xuất cắt gọn CLAUDE.md). Hai thứ khác nghề mà cùng tên, trong một template phân
 * phối cho nhiều đội, là chi phí nhầm lẫn có thật — và nó tăng theo số repo, không giảm.
 *
 * VÌ SAO CÓ ALIAS chứ không đổi thẳng: tên cũ đang nằm trong CI của các project đã
 * áp template, trong runbook, và trong ngón tay người ta. Một lần đổi tên im lặng
 * biến thành `command not found` ở CI của người khác vào một ngày họ đang gấp.
 *
 * ĐIỀU KIỆN THOÁT: xoá file này ở version 3.0.0. Mốc đã ghi vào HARNESS-CHANGELOG.md.
 */
import { spawnSync } from 'node:child_process';
import { repoPath } from './lib/harness.mjs';

console.error('⚠️  `tooling/doctor.mjs` đã đổi tên → `tooling/harness-doctor.mjs`.');
console.error('   Alias này chỉ tồn tại ở 2.x. Cập nhật CI/runbook của bạn ngay.');
console.error('   Lý do: `/doctor` là lệnh native của Claude Code — hai thứ cùng tên gây nhầm.');

const r = spawnSync(process.execPath, [repoPath('tooling', 'harness-doctor.mjs'), ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(r.status ?? 1);
