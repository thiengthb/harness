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
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { telemetry, telemetryDir, currentBranch, fixlogKey } from './lib/harness.mjs';

const args = process.argv.slice(2);
const file = join(telemetryDir(), 'manual-fixes.log');
const closedFile = join(telemetryDir(), 'fixlog-closed.log');

/** Nhóm đã đóng → { ts, why }. Cùng thư mục telemetry với fixlog: cả hai là dữ liệu MÁY NÀY. */
function readClosed() {
  const m = new Map();
  if (!existsSync(closedFile)) return m;
  for (const l of readFileSync(closedFile, 'utf8').split('\n').filter(Boolean)) {
    const [ts, key, ...why] = l.split('\t');
    m.set(key, { ts, why: why.join(' ').trim() });
  }
  return m;
}

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
  const groups = new Map();
  for (const r of readLog()) {
    const k = fixlogKey(r.text);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const closed = readClosed();
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  console.log('\n=== NHÓM THEO TẦN SUẤT ===');
  for (const [k, rows] of sorted.slice(0, 15)) {
    const done = closed.get(k);
    const flag = done ? '✔' : rows.length >= 2 ? '★' : ' ';
    console.log(`${flag} ${String(rows.length).padStart(3)}×  ${rows[0].text}`);
    if (done) console.log(`         ĐÃ ĐÓNG ${String(done.ts).slice(0, 10)}: ${done.why}`);
  }
  console.log('\n  ★ = xuất hiện ≥2 lần → ĐỦ ĐIỀU KIỆN promote thành bài học (một lần là ngẫu nhiên).');
  console.log('  ✔ = đã xử lý xong, không tính là việc tới hạn nữa.');
  console.log('    Chạy /harness-propose cho mục ★, rồi đóng nó:');
  console.log('    node tooling/fixlog.mjs --close "<vài chữ trong mục>" "<đã làm gì>"\n');
  process.exit(0);
}

// ── --close : đánh dấu một NHÓM đã xử lý xong ───────────────────────────────
//
// VÌ SAO CẦN. Nếu không có bước này thì một nhóm ≥2 lần ĐỎ VĨNH VIỄN: fixlog chỉ biết ghi
// thêm, không biết rằng việc đã được xử. Đo 2026-08-05 ở `sakubun`: nhóm `gen-clean chẩn đoán
// sai` đạt 2 lần, đã được sửa ở template v2.10.0 — nhưng fixlog cục bộ không biết, nên
// `rituals` sẽ nhắc `/harness-retro` mãi mãi. Một mục đỏ vĩnh viễn dạy người ta bỏ qua màu đỏ,
// và đó là tầng 1 của `knowledge/lessons/0003`.
//
// KHỚP THEO VĂN BẢN, không theo số thứ tự: thứ tự trong `--top` đổi mỗi lần có dòng mới, nên
// `--close 2` hôm nay và `--close 2` ngày mai là hai nhóm khác nhau. Khớp 0 hoặc >1 nhóm thì
// TỪ CHỐI kèm danh sách ứng viên — đóng nhầm nhóm là làm tắt một cảnh báo đang đúng.
if (args[0] === '--close') {
  const needle = (args[1] || '').trim().toLowerCase();
  const why = args.slice(2).join(' ').trim();
  if (!needle || !why) {
    console.error('Cách dùng: node tooling/fixlog.mjs --close "<vài chữ trong mục>" "<đã xử lý thế nào>"');
    console.error('  Lý do là BẮT BUỘC: một nhóm bị đóng mà không ghi vì sao thì lần sau không ai dựng lại được quyết định.');
    process.exit(1);
  }
  const groups = new Map();
  for (const r of readLog()) {
    const k = fixlogKey(r.text);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const hits = [...groups.entries()].filter(([, rows]) => rows[0].text.toLowerCase().includes(needle));
  if (hits.length !== 1) {
    console.error(hits.length ? `Khớp ${hits.length} nhóm — hãy nói cụ thể hơn:` : 'Không nhóm nào khớp. Các nhóm đang có:');
    for (const [, rows] of (hits.length ? hits : [...groups.entries()]).slice(0, 10)) {
      console.error(`  · ${rows[0].text.slice(0, 110)}`);
    }
    process.exit(1);
  }
  const [key, rows] = hits[0];
  appendFileSync(closedFile, [new Date().toISOString(), key, why].join('\t') + '\n', 'utf8');
  console.log(`\n✔ đã đóng nhóm (${rows.length}×): ${rows[0].text.slice(0, 100)}`);
  console.log(`  lý do: ${why}`);
  console.log('  Nhóm này không còn được tính là việc tới hạn. Mục fixlog vẫn giữ nguyên làm bằng chứng.\n');
  process.exit(0);
}

const text = args.join(' ').trim();
if (!text) {
  console.error(`Cách dùng:
  node tooling/fixlog.mjs "mô tả việc bạn vừa phải sửa tay"
  node tooling/fixlog.mjs --list     # 7 ngày qua
  node tooling/fixlog.mjs --top      # nhóm theo tần suất, đánh dấu cái đủ điều kiện promote
  node tooling/fixlog.mjs --close "<vài chữ>" "<đã xử lý thế nào>"   # đóng một nhóm đã xử xong`);
  process.exit(1);
}

telemetry('manual-fixes', [currentBranch(), text]);
const count = readLog().length;
console.log(`✓ đã ghi (tổng ${count}). Thứ Sáu chạy /harness-retro.`);
