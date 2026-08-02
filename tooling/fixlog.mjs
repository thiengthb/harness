#!/usr/bin/env node
/**
 * BƯỚC 1 CỦA VÒNG HỌC — và là thứ RẺ NHẤT, GIÁ TRỊ NHẤT trong toàn bộ harness.
 *
 *   node tooling/fixlog.mjs "agent lại quên chạy gen sau khi sửa contract"
 *   node tooling/fixlog.mjs --list          # xem 7 ngày qua
 *   node tooling/fixlog.mjs --top           # nhóm theo tần suất
 *
 * Mỗi lần bạn phải SỬA TAY việc agent làm, ghi một dòng. Mất 3 giây.
 * Nó biến trực giác mơ hồ ("dạo này agent hay quên...") thành dữ liệu đếm được,
 * và con số đó chính xác hơn mọi bảng công cụ trong mọi tài liệu về harness.
 *
 * Alias tiện tay (thêm vào shell profile):
 *   fixlog() { node "$(git rev-parse --show-toplevel)/tooling/fixlog.mjs" "$@"; }
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { telemetry, telemetryDir, currentBranch } from './lib/harness.mjs';

const args = process.argv.slice(2);
const file = join(telemetryDir(), 'manual-fixes.log');

function readLog() {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => {
    const [ts, project, branch, ...rest] = l.split('|');
    return { ts, project, branch, text: rest.join('|').trim() };
  });
}

if (args[0] === '--list') {
  const since = Date.now() - 7 * 86400_000;
  const rows = readLog().filter(r => new Date(r.ts).getTime() >= since);
  console.log(`\n=== SỬA TAY 7 NGÀY QUA (${rows.length}) ===`);
  for (const r of rows) console.log(`  ${r.ts.slice(0, 16).replace('T', ' ')}  [${r.branch || '-'}]  ${r.text}`);
  console.log(rows.length >= 10
    ? '\n  ⚠️  ≥10 lần/tuần. Đây là backlog harness của bạn. Chạy /harness-retro.\n'
    : '\n  Chạy /harness-retro thứ Sáu để chưng cất thành đề xuất.\n');
  process.exit(0);
}

if (args[0] === '--top') {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9à-ỹ\s]/gi, ' ').split(/\s+/).filter(w => w.length > 3).slice(0, 6).join(' ');
  const groups = new Map();
  for (const r of readLog()) {
    const k = norm(r.text);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  console.log('\n=== NHÓM THEO TẦN SUẤT ===');
  for (const [, rows] of sorted.slice(0, 15)) {
    const flag = rows.length >= 2 ? '★' : ' ';
    console.log(`${flag} ${String(rows.length).padStart(3)}×  ${rows[0].text}`);
  }
  console.log('\n  ★ = xuất hiện ≥2 lần → ĐỦ ĐIỀU KIỆN promote thành bài học (một lần là ngẫu nhiên).');
  console.log('    Chạy /harness-propose cho từng mục có ★.\n');
  process.exit(0);
}

const text = args.join(' ').trim();
if (!text) {
  console.error(`Cách dùng:
  node tooling/fixlog.mjs "mô tả việc bạn vừa phải sửa tay"
  node tooling/fixlog.mjs --list     # 7 ngày qua
  node tooling/fixlog.mjs --top      # nhóm theo tần suất, đánh dấu cái đủ điều kiện promote`);
  process.exit(1);
}

telemetry('manual-fixes', [currentBranch(), text]);
const count = readLog().length;
console.log(`✓ đã ghi (tổng ${count}). Thứ Sáu chạy /harness-retro.`);
