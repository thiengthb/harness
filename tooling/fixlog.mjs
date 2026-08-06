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
import { telemetry, telemetryDir, currentBranch, fixlogKey, fixlogGroupRules, FIXLOG_GROUPS_FILE } from './lib/harness.mjs';

const args = process.argv.slice(2);
const file = join(telemetryDir(), 'manual-fixes.log');
const closedFile = join(telemetryDir(), 'fixlog-closed.log');

// Luật gom nhóm do NGƯỜI khai. Đọc MỘT lần rồi truyền xuống mọi chỗ gọi `fixlogKey` trong file
// này — `--top` và `--close` phải nhìn thấy đúng một tập nhóm, nếu không thì `--close` đóng một
// khoá mà `--top` không sinh ra (đúng lỗi mà comment ở `lib/harness.mjs` đã cảnh báo).
const RULES = fixlogGroupRules();

/** Gom log thành nhóm theo khoá — dùng chung bởi `--top`, `--close`, `--group`. */
function groupLog() {
  const groups = new Map();
  for (const r of readLog()) {
    const k = fixlogKey(r.text, RULES);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return groups;
}

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
  const groups = groupLog();
  const closed = readClosed();
  const manual = new Set(RULES.map(r => r.key));
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  console.log('\n=== NHÓM THEO TẦN SUẤT ===');
  for (const [k, rows] of sorted.slice(0, 15)) {
    const done = closed.get(k);
    const flag = done ? '✔' : rows.length >= 2 ? '★' : ' ';
    const by = manual.has(k) ? ' ⊕' : '';
    console.log(`${flag} ${String(rows.length).padStart(3)}×${by}  ${rows[0].text}`);
    // Nhóm THỦ CÔNG in HẾT các văn bản khác nhau nó đã gom. Nếu chỉ in dòng đầu như nhóm từ
    // vựng, một luật `--group` quá rộng sẽ nuốt một lỗi KHÁC vào cùng nhóm mà không ai thấy —
    // tức bịa ra một nhóm ≥2. Gom thì được phép, gom LÉN thì không.
    if (manual.has(k)) {
      for (const t of [...new Set(rows.slice(1).map(r => r.text))]) console.log(`         · ${t.slice(0, 110)}`);
    }
    if (done) console.log(`         ĐÃ ĐÓNG ${String(done.ts).slice(0, 10)}: ${done.why}`);
  }
  console.log('\n  ★ = xuất hiện ≥2 lần → ĐỦ ĐIỀU KIỆN promote thành bài học (một lần là ngẫu nhiên).');
  console.log('  ✔ = đã xử lý xong, không tính là việc tới hạn nữa.');
  console.log('  ⊕ = nhóm do BẠN khai (--group), không phải máy đoán. Mọi văn bản trong nhóm in ngay dưới.');
  console.log('\n  Nhóm mặc định là phép LEXICAL "6 từ đầu" — nó chỉ gom được khi bạn tình cờ mở đầu');
  console.log('  giống nhau, nên "0 nhóm ★" KHÔNG có nghĩa là "không có gì lặp lại". Thấy hai dòng');
  console.log('  cùng một gốc rễ mà nằm rời nhau thì khai nhóm:');
  console.log('    node tooling/fixlog.mjs --group "<tên-nhóm>" "<vài chữ chung của các dòng đó>"');
  console.log('    node tooling/fixlog.mjs --close "<vài chữ trong mục>" "<đã làm gì>"   # sau khi xử xong\n');
  process.exit(0);
}

// ── --group : NGƯỜI khai hai dòng là cùng một gốc rễ ────────────────────────
//
// Xem `fixlogKey` ở `lib/harness.mjs` cho lý do đầy đủ. Tóm tắt: phép nhóm từ vựng bỏ sót theo
// chiều dễ chịu, và phép nhóm thông minh hơn sẽ bịa theo chiều nguy hiểm. Nên máy không đoán —
// người khai, máy áp dụng tất định.
//
// Luật áp cho CẢ dòng cũ lẫn dòng mới, nên không cần gắn nhãn lúc ghi: đường ghi fixlog vẫn là
// một câu tiếng Việt trong 3 giây, đúng thứ làm nó được dùng thật.
if (args[0] === '--group') {
  const key = (args[1] || '').trim();
  const needle = (args[2] || '').trim();
  if (!key || !needle) {
    console.error('Cách dùng: node tooling/fixlog.mjs --group "<tên-nhóm>" "<vài chữ chung của các dòng>"');
    console.error('  Ví dụ:   node tooling/fixlog.mjs --group "dcg-chan-nham" "dcg"');
    console.error('  Luật khớp theo CHUỖI CON, không phân biệt hoa thường, và áp cho cả dòng ghi sau này.');
    process.exit(1);
  }
  const hits = readLog().filter(r => r.text.toLowerCase().includes(needle.toLowerCase()));
  if (!hits.length) {
    // Từ khoá không khớp dòng nào gần như luôn là gõ nhầm. Ghi im lặng thì luật nằm đó vô hiệu
    // và người ta tưởng đã gom xong.
    console.error(`Không dòng fixlog nào chứa "${needle}". Không ghi luật nào.`);
    console.error('  Các dòng đang có:');
    for (const r of readLog().slice(-10)) console.error(`  · ${r.text.slice(0, 110)}`);
    process.exit(1);
  }
  appendFileSync(FIXLOG_GROUPS_FILE(), [new Date().toISOString(), key, needle].join('\t') + '\n', 'utf8');
  console.log(`\n⊕ nhóm "${key}" giờ gom ${hits.length} dòng:`);
  for (const r of hits) console.log(`  · ${r.ts.slice(0, 10)}  ${r.text.slice(0, 100)}`);
  console.log(hits.length >= 2
    ? `\n  ${hits.length} ≥ 2 ⇒ nhóm này ĐỦ ĐIỀU KIỆN promote. Chạy /harness-propose.\n`
    : '\n  Mới 1 dòng — luật đã ghi, dòng sau khớp "' + needle + '" sẽ tự vào nhóm này.\n');
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
  const groups = groupLog();
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
  node tooling/fixlog.mjs --group "<tên-nhóm>" "<vài chữ chung>"     # khai hai dòng là cùng gốc rễ
  node tooling/fixlog.mjs --close "<vài chữ>" "<đã xử lý thế nào>"   # đóng một nhóm đã xử xong`);
  process.exit(1);
}

telemetry('manual-fixes', [currentBranch(), text]);
const count = readLog().length;
console.log(`✓ đã ghi (tổng ${count}). Thứ Sáu chạy /harness-retro.`);
