#!/usr/bin/env node
/**
 * Cổng cứng trước khi kết thúc turn.   Stop hook
 *
 * Đây là hạng 1 của bảng đòn bẩy: MỘT check agent tự chạy được. Không có nó,
 * mọi thứ khác trong harness là trang trí, vì BẠN là verification loop.
 *
 * Gate nào chạy do harness.config.json → gates.stop quyết định.
 * Gate chưa khai báo lệnh sẽ bị BỎ QUA (báo là skipped), không fail.
 */
import { config, runConfigured, git, spill, telemetry, report } from '../../tooling/lib/harness.mjs';

const gates = config().gates?.stop ?? [];
if (!gates.length) process.exit(0);

const ok = [], warn = [], fail = [];

for (const gate of gates) {
  if (gate === 'gen-clean') {
    const gen = runConfigured('gen', { capture: true });
    if (gen.skipped) { warn.push('gen-clean: chưa khai báo commands.gen — bỏ qua'); continue; }
    if (gen.status !== 0) { fail.push(`gen-clean: lệnh gen fail (${spill('gen', gen.stdout + gen.stderr)})`); continue; }
    const diff = git(['status', '--porcelain', '--untracked-files=no']);
    const dirty = diff.stdout.split('\n').filter(Boolean);
    if (dirty.length) {
      fail.push(`gen-clean: chạy gen xong git vẫn dirty (${dirty.length} file) → bạn quên chạy gen sau khi sửa nguồn`);
    } else ok.push('gen-clean');
    continue;
  }

  const r = runConfigured(gate, { capture: true });
  if (r.skipped) { warn.push(`${gate}: chưa khai báo commands.${gate} — bỏ qua`); continue; }
  if (r.status !== 0) {
    const log = spill(gate, (r.stdout || '') + '\n' + (r.stderr || ''));
    fail.push(`${gate}: FAIL → ${log}`);
    telemetry('gate-fails', ['stop-gate', gate]);
  } else ok.push(gate);
}

report('STOP GATE', { ok, warn, fail });

if (fail.length) {
  console.error('Chưa được kết thúc turn. Sửa các dòng FAIL ở trên.');
  console.error('Nếu bạn tin gate sai: KHÔNG tắt hook — chạy /harness-propose.');
  process.exit(2);
}
process.exit(0);
