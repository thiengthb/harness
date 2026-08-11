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
import { telemetry, telemetryDir, currentBranch, fixlogKey, fixlogGroupRules, FIXLOG_GROUPS_FILE,
  FIXLOG_CLOSED_FILE, FIXLOG_TRACKED_FILE, groupMarks, groupStillClosed, groupTracked, handledGroups } from './lib/harness.mjs';

const args = process.argv.slice(2);
const file = join(telemetryDir(), 'manual-fixes.log');
const closedFile = FIXLOG_CLOSED_FILE();

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

/** Nhóm đã đóng / đã có địa chỉ → { ts, note }. Cùng thư mục telemetry: dữ liệu MÁY NÀY. */
const readClosed = () => groupMarks(closedFile);
const readTracked = () => groupMarks(FIXLOG_TRACKED_FILE());

function readLog() {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => {
    const [ts, project, branch, ...rest] = l.split('|');
    return { ts, project, branch, text: rest.join('|').trim() };
  });
}

// ── --list : 7 ngày qua, và MẪU SỐ là số mục CHƯA XỬ ────────────────────────
//
// Ngưỡng cũ đếm MỌI mục trong 7 ngày, kể cả mục thuộc nhóm đã `--close` và (từ v2.64.0) đã
// `--track`. Đo 2026-08-12: cảnh báo bật với **11 mục** — 5 thuộc nhóm đã đóng từ 08-07, 4
// thuộc hai nhóm đã có địa chỉ (#177, #160). Thật sự chưa xử: **2**.
//
// `rituals` đã sửa đúng chỗ này ở #182 (`fixlogOpen`) và KHÔNG sửa ở đây — vá một chỗ, để lại
// chỗ bên cạnh, đúng lỗi mà learnings W32 §1 (`so-khong-bao-gio-dong-duoc`) đã mắc. Nên phép trừ là MỘT hàm
// dùng chung (`handledGroups()` ở lib), không phải hai bản chép.
if (args[0] === '--list') {
  const since = Date.now() - 7 * 86400_000;
  const rows = readLog().filter(r => new Date(r.ts).getTime() >= since);
  // Gom nhóm trên CẢ sổ rồi mới cắt cửa sổ. Cắt trước khi gom thì nhóm được dựng lại từ mảnh
  // 7 ngày, và một nhóm đóng từ tháng trước mất luôn dấu đã-xử của nó.
  const groups = groupLog();
  const handled = handledGroups(new Map([...groups].map(([k, rs]) => [k, rs.map(r => r.ts)])), readClosed(), readTracked());
  const done = (r) => handled.has(fixlogKey(r.text, RULES));
  const open = rows.filter(r => !done(r));
  const hidden = rows.length - open.length;
  console.log(`\n=== SỬA TAY 7 NGÀY QUA (${rows.length} — ${open.length} CHƯA XỬ) ===`);
  for (const r of rows) console.log(`${done(r) ? '·' : ' '} ${r.ts.slice(0, 16).replace('T', ' ')}  [${r.branch || '-'}]  ${r.text}`);
  console.log(open.length >= 10
    ? `\n  ⚠️  ${open.length} mục CHƯA XỬ trong 7 ngày. Đây là backlog harness của bạn. Chạy /harness-retro.\n`
    : hidden
      ? `\n  ${hidden} mục mang dấu \`·\`: nhóm đã đóng (✔) hoặc đã có địa chỉ (⇢) — xem \`--top\`.`
        + `\n  Ngưỡng ≥10 đặt trên ${open.length} mục CHƯA XỬ, không trên ${rows.length}: sổ chỉ biết ghi thêm,`
        + '\n  nên một ngưỡng đếm cả việc đã xong sẽ đỏ vĩnh viễn và thôi là tín hiệu.\n'
      : '\n  Chạy /harness-retro thứ Sáu để chưng cất thành đề xuất.\n');
  process.exit(0);
}

if (args[0] === '--top') {
  const groups = groupLog();
  const closed = readClosed();
  const tracked = readTracked();
  const manual = new Set(RULES.map(r => r.key));
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  console.log('\n=== NHÓM THEO TẦN SUẤT ===');
  for (const [k, rows] of sorted.slice(0, 15)) {
    const done = closed.get(k);
    const track = tracked.get(k);
    // TÁI PHÁT: đã đóng, mà vẫn có mục ghi SAU ngày đóng. Dấu ✔ khi đó là một lời khai sai —
    // và nó sai theo chiều im lặng (`L0006`): việc chưa xong đọc y hệt việc đã xong.
    const { closed: stillClosed, recurred } = groupStillClosed(done?.ts, rows.map(r => r.ts));
    const trk = groupTracked(track?.ts, rows.map(r => r.ts));
    // THỨ TỰ ƯU TIÊN, và nó không tuỳ ý: `↻` trước vì nó BÁC BỎ một lời khai (đã đóng mà vẫn
    // xảy ra); `✔` trước `⇢` vì đã sửa xong thì cái địa chỉ kia không còn là việc. `⇢` đứng
    // trên `★` vì `★` nghĩa là *"chưa ai chưng cất"* — với nhóm đã có địa chỉ thì đó là sai.
    const flag = recurred.length ? '↻' : stillClosed ? '✔' : trk.tracked ? '⇢' : rows.length >= 2 ? '★' : ' ';
    const by = manual.has(k) ? ' ⊕' : '';
    console.log(`${flag} ${String(rows.length).padStart(3)}×${by}  ${rows[0].text}`);
    // Nhóm THỦ CÔNG in HẾT các văn bản khác nhau nó đã gom. Nếu chỉ in dòng đầu như nhóm từ
    // vựng, một luật `--group` quá rộng sẽ nuốt một lỗi KHÁC vào cùng nhóm mà không ai thấy —
    // tức bịa ra một nhóm ≥2. Gom thì được phép, gom LÉN thì không.
    if (manual.has(k)) {
      for (const t of [...new Set(rows.slice(1).map(r => r.text))]) console.log(`         · ${t.slice(0, 110)}`);
    }
    if (recurred.length) {
      console.log(`         ↻ MỞ LẠI — đóng ngày ${String(done.ts).slice(0, 10)} nhưng có ${recurred.length} mục ghi SAU đó `
        + `(gần nhất ${recurred.at(-1).slice(0, 10)}). Lý do đóng cũ KHÔNG còn phủ được nhóm này.`);
      console.log(`         lý do đóng cũ: ${String(done.note).slice(0, 150)}`);
    } else if (done) console.log(`         ĐÃ ĐÓNG ${String(done.ts).slice(0, 10)}: ${done.note}`);
    else if (trk.tracked) {
      // Tái phát KHÔNG đổi dấu — nó là bằng chứng CỘNG THÊM cho việc đang chờ, không phải một
      // lời khai bị bác bỏ (xem `groupTracked` ở lib). Nhưng nó phải HIỆN RA: đó là con số nói
      // cho bạn biết việc đang chờ kia đắt lên, và nó thay cho một màu đỏ không tắt được.
      console.log(`         ⇢ ĐANG CHỜ ${trk.recurred.length ? `— và đã TÁI PHÁT ${trk.recurred.length} lần kể từ khi ghi` : ''}`.trimEnd());
      console.log(`         ${String(track.note).slice(0, 150)} (ghi ${String(track.ts).slice(0, 10)})`);
    }
  }
  console.log('\n  ★ = xuất hiện ≥2 lần → ĐỦ ĐIỀU KIỆN promote thành bài học (một lần là ngẫu nhiên).');
  console.log('  ✔ = đã xử lý xong, không tính là việc tới hạn nữa.');
  console.log('  ⇢ = ĐÃ CÓ ĐỊA CHỈ (issue/PR), đang chờ — retro đã làm xong phần của nó, việc chờ NGƯỜI KHÁC.');
  console.log('      Tái phát KHÔNG mở lại nhóm này, nhưng số lần tái phát in ra: nó nói việc đang chờ đắt lên.');
  console.log('  ↻ = ĐÃ ĐÓNG rồi mà TÁI PHÁT — có mục ghi sau ngày đóng. Đóng lại bằng `--close` mới, hoặc tách nhóm.');
  console.log('  ⊕ = nhóm do BẠN khai (--group), không phải máy đoán. Mọi văn bản trong nhóm in ngay dưới.');
  console.log('\n  Nhóm mặc định là phép LEXICAL "6 từ đầu" — nó chỉ gom được khi bạn tình cờ mở đầu');
  console.log('  giống nhau, nên "0 nhóm ★" KHÔNG có nghĩa là "không có gì lặp lại". Thấy hai dòng');
  console.log('  cùng một gốc rễ mà nằm rời nhau thì khai nhóm:');
  console.log('    node tooling/fixlog.mjs --group "<tên-nhóm>" "<vài chữ chung của các dòng đó>"');
  console.log('    node tooling/fixlog.mjs --track "<vài chữ trong mục>" "<issue + chờ gì>"  # đã có địa chỉ');
  console.log('    node tooling/fixlog.mjs --close "<vài chữ trong mục>" "<đã làm gì>"       # sau khi xử XONG\n');
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
// Khớp ĐÚNG MỘT nhóm theo văn bản, hoặc dừng kèm danh sách ứng viên. Dùng chung bởi `--close`
// và `--track`: hai lệnh khác nhau về NGHĨA, nhưng phép chọn nhóm phải giống hệt nhau — lệch
// nhau thì `--track` đánh dấu một nhóm mà `--close` không nhìn thấy.
function findOneGroup(needle) {
  const groups = groupLog();
  const hits = [...groups.entries()].filter(([, rows]) => rows[0].text.toLowerCase().includes(needle));
  if (hits.length !== 1) {
    console.error(hits.length ? `Khớp ${hits.length} nhóm — hãy nói cụ thể hơn:` : 'Không nhóm nào khớp. Các nhóm đang có:');
    for (const [, rows] of (hits.length ? hits : [...groups.entries()]).slice(0, 10)) {
      console.error(`  · ${rows[0].text.slice(0, 110)}`);
    }
    process.exit(1);
  }
  return hits[0];
}

// ── --track : nhóm ĐÃ THÀNH một việc có địa chỉ, đang chờ ────────────────────
//
// Trạng thái thứ tư. Xem `groupTracked()` ở `lib/harness.mjs` cho lý do đầy đủ; tóm tắt:
// `--close` khai *"đã sửa tận gốc"*, còn đây khai *"tôi biết, nó ở #177, đang chờ người khác"*.
// Không có trạng thái này thì một nhóm bị chặn ngoài tầm tay bạn đội `★` mãi mãi, và
// `/harness-retro` bảo bạn chưng cất một thứ đã chưng cất rồi.
if (args[0] === '--track') {
  const needle = (args[1] || '').trim().toLowerCase();
  const ref = args.slice(2).join(' ').trim();
  if (!needle || !ref) {
    console.error('Cách dùng: node tooling/fixlog.mjs --track "<vài chữ trong mục>" "<issue/PR + đang chờ gì>"');
    console.error('  Ví dụ:   node tooling/fixlog.mjs --track "nuot backtick" "#177 — chờ DRI, bản vá nằm trong .claude/hooks/"');
    console.error('  ĐỊA CHỈ là BẮT BUỘC: "đang chờ" mà không nói chờ ở đâu thì không khác gì im lặng bỏ qua.');
    process.exit(1);
  }
  const [key, rows] = findOneGroup(needle);
  appendFileSync(FIXLOG_TRACKED_FILE(), [new Date().toISOString(), key, ref].join('\t') + '\n', 'utf8');
  console.log(`\n⇢ đã ghi địa chỉ cho nhóm (${rows.length}×): ${rows[0].text.slice(0, 100)}`);
  console.log(`  đang chờ: ${ref}`);
  console.log('  Nhóm KHÔNG bị giấu: nó vẫn in trong `--top` với đủ số đếm, và nếu tái phát thì số lần');
  console.log('  tái phát hiện ra cạnh nó. Sửa xong thì `--close`, đừng để nguyên ở đây.\n');
  process.exit(0);
}

if (args[0] === '--close') {
  const needle = (args[1] || '').trim().toLowerCase();
  const why = args.slice(2).join(' ').trim();
  if (!needle || !why) {
    console.error('Cách dùng: node tooling/fixlog.mjs --close "<vài chữ trong mục>" "<đã xử lý thế nào>"');
    console.error('  Lý do là BẮT BUỘC: một nhóm bị đóng mà không ghi vì sao thì lần sau không ai dựng lại được quyết định.');
    console.error('  Chưa sửa xong mà chỉ đang chờ ai đó? Dùng `--track`, đừng dùng `--close`.');
    process.exit(1);
  }
  const [key, rows] = findOneGroup(needle);
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
  node tooling/fixlog.mjs --track "<vài chữ>" "<issue + chờ gì>"     # đã thành việc CÓ ĐỊA CHỈ, đang chờ
  node tooling/fixlog.mjs --close "<vài chữ>" "<đã xử lý thế nào>"   # đóng một nhóm đã xử XONG`);
  process.exit(1);
}

telemetry('manual-fixes', [currentBranch(), text]);
const count = readLog().length;
console.log(`✓ đã ghi (tổng ${count}). Thứ Sáu chạy /harness-retro.`);
