#!/usr/bin/env node
/**
 * BỀ MẶT NATIVE — tập sự kiện hook mà Claude Code THẬT SỰ có, đo từ binary đang chạy.
 *
 *   node tooling/native-surface.mjs            đo và in: sự kiện nào có · nào đang cắm · nào trống
 *   node tooling/native-surface.mjs --record   ghi tập vừa đo vào .claude/claude-code-baseline.json
 *
 * ── VÌ SAO NÓ TỒN TẠI
 *
 * Nghi thức `claude-code-drift` **kích hoạt bằng máy** (so version) nhưng **trả lời bằng
 * người** (văn xuôi tự do). Câu hỏi *"vendor vừa ra sẵn thứ nào harness đang tự làm tay?"*
 * đúng là việc của người. Nhưng *"tập sự kiện có đổi không"* là một **phép trừ tập hợp**, và
 * nó đang được giao cho trí nhớ.
 *
 * Đo 2026-08-07 (issue #85): bản rà `2.1.222` ghi *"13 tên"*; binary `2.1.224` đang chạy có
 * **31**. Bản rà `2.1.224` — viết cùng ngày — không nhắc tập sự kiện. Dù bề mặt thật sự lớn
 * lên hay lần grep trước chỉ thử một danh sách ứng viên, kết luận không đổi: **con số duy
 * nhất kiểm được bằng máy trong cả bề mặt đó đi từ 13 lên 31 mà không cơ chế nào tính.**
 *
 * `AGENTS.md §Verification`: *"Mỗi lần định nhờ LLM chấm, hỏi trước: có biến thành check tất
 * định được không?"* — ở đây là CÓ.
 *
 * ── VÌ SAO KHÔNG CHẠY MỖI PHIÊN
 *
 * Binary là **285 MB**. Đo trên máy này 2026-08-07: **501 · 533 · 615 ms** cho một lần quét
 * đầy đủ (đã ấm cache OS; lần đầu sau khi khởi động máy sẽ đắt hơn). Chấp nhận được cho một
 * lệnh người gõ; KHÔNG chấp nhận được ở `SessionStart`, nơi bản tin đầu phiên phải ngắn và
 * `gates.mjs` đã trả một sàn ~100 ms cho việc khác.
 *
 * Nên kết quả được CACHE theo version trong `.claude/claude-code-baseline.json`, và
 * `rituals.mjs` chỉ so version — một phép so chuỗi.
 *
 * ── BA TRẠNG THÁI
 *
 * Không tìm được binary, hoặc tìm được mà không match được mảng ⇒ **`?`**, không phải `ok`.
 * Một bề mặt "0 sự kiện" và một bề mặt "chưa đo được" đọc giống hệt nhau nếu gộp — và đây là
 * công cụ ra đời để chống đúng phép gộp đó.
 */
import { readSync, openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoPath, readJson, writeJson, report, exists } from './lib/harness.mjs';
import { claudeCodeVersionMeasured } from './rituals.mjs';

const RECORD = process.argv.includes('--record');
const BASELINE = repoPath('.claude', 'claude-code-baseline.json');

/**
 * Rút tập sự kiện hook từ binary.
 *
 * NEO LÀ MỘT MẢNG CHUỖI CHỨA `PreToolUse`, không phải một danh sách ứng viên viết tay. Đó là
 * khác biệt quan trọng: một danh sách ứng viên chỉ tìm được thứ mình đã biết, nên nó không
 * bao giờ phát hiện được sự kiện MỚI — và phát hiện sự kiện mới là toàn bộ mục đích ở đây.
 * (Giả thuyết hàng đầu cho con số "13" ở bản rà 2.1.222: nó đã làm đúng như vậy.)
 *
 * Đọc theo khối có CHỒNG LẤN: mảng nằm vắt qua ranh giới khối thì không khớp, và một phép đo
 * im lặng bỏ sót còn tệ hơn không đo.
 */
const EVENT_ARRAY_SRC = String.raw`\[(?:\s*["'][A-Z][A-Za-z]{3,30}["']\s*,){6,}\s*["'][A-Z][A-Za-z]{3,30}["']\s*\]`;

/** Khối đọc mặc định. Xuất ra để test khẳng định được `OVERLAP > độ dài mảng thật`. */
export const SCAN = { chunk: 8 * 1024 * 1024, overlap: 8192 };

/**
 * THUẦN — phần PHÁN ĐOÁN của phép rút, tách khỏi IO.
 *
 * Tách ra vì phần này là chỗ duy nhất có logic đáng sai, và test nó qua một binary 285 MB
 * thì không dựng được ở CI ba OS. Cùng lý do bảng `dangerousCommand` khẳng định thẳng vào
 * hàm thuần thay vì spawn hook (v2.36.0).
 *
 * `prev` để gọi được nhiều lần khi quét theo khối — mỗi khối góp ứng viên vào cùng một
 * phép chọn.
 */
export function pickEventArray(text, prev = null) {
  return pickLongestArray(text, EVENT_ARRAY_SRC, 'PreToolUse', prev);
}

/**
 * THUẦN — chọn mảng DÀI NHẤT khớp `src` và có chứa `must`.
 *
 * Tách khỏi `pickEventArray` khi bảng key frontmatter (#94) cần đúng phép chọn này với một
 * neo khác. Hai bảng, một phép phán đoán — chép đôi nó nghĩa là ca test *"lấy mảng ĐẦU TIÊN"*
 * chỉ khoá được một bản.
 */
export function pickLongestArray(text, src, must, prev = null) {
  let best = prev;
  // Regex MỚI mỗi lần: `matchAll` đòi cờ `g`, và một regex `g` dùng chung giữa nhiều lời gọi
  // là một mẩu trạng thái ẩn không đáng có trong một hàm khai là THUẦN.
  for (const m of String(text).matchAll(new RegExp(src, 'g'))) {
    if (must && !m[0].includes(must)) continue;
    try {
      const arr = JSON.parse(m[0].replace(/'/g, '"'));
      // Lấy mảng DÀI NHẤT: bundle có thể chứa nhiều tập con (ví dụ danh sách sự kiện của
      // một tính năng con). Tập đầy đủ là tập bao trùm.
      //
      // Bản "lấy mảng ĐẦU TIÊN khớp" đi qua mọi phép đo thủ công và trả về một tập CON — và
      // một tập con đọc y hệt "vendor vừa bỏ N sự kiện", tức đúng cảnh báo giả mà công cụ
      // này ra đời để tránh. Ca test `chọn mảng DÀI NHẤT` khoá đúng bản đó.
      if (!best || arr.length > best.length) best = arr;
    } catch { /* không parse được thì bỏ qua ứng viên này */ }
  }
  return best;
}

/**
 * Bảng key frontmatter mà Claude Code THẬT SỰ đọc — issue #94.
 *
 * Đây là HỢP NHẤT của skill + plugin + agent + output-style (nó chứa `mcpServers`, `themes`,
 * `workflows`). **Đừng nhận cả bảng cho một `SKILL.md`** — làm thế là nới check thay vì sửa
 * nó. Chỗ dùng đúng là `harness-doctor`: phân biệt *"key gõ sai"* với *"key vendor CÓ mà
 * allowlist chưa biết"*.
 *
 * Neo có chữ hoa TỪ KÝ TỰ THỨ HAI: bảng thật chứa `mcpServers`, `disallowedTools`,
 * `permissionMode`. Bản đầu của regex này chỉ nhận chữ thường và khớp **0 mảng** — im lặng,
 * và một `null` ở đây đọc y hệt *"vendor đổi hình dạng bundle"*.
 */
const FM_KEY_ARRAY_SRC = String.raw`\[(?:\s*"[a-z][A-Za-z0-9_-]{2,40}"\s*,){19,}\s*"[a-z][A-Za-z0-9_-]{2,40}"\s*\]`;

export function pickFrontmatterKeys(text, prev = null) {
  return pickLongestArray(text, FM_KEY_ARRAY_SRC, '"disable-model-invocation"', prev);
}

/** Vendor chuẩn hoá tên key trước khi đọc — `disallowed-tools` ≡ `disallowedTools`. */
export const normKey = (s) => String(s).replace(/[-_]/g, '').toLowerCase();

export function nativeFrontmatterKeys(execPath = process.env.CLAUDE_CODE_EXECPATH || '', opts = {}) {
  return scanBinary(execPath, pickFrontmatterKeys, opts);
}

export function nativeHookEvents(execPath = process.env.CLAUDE_CODE_EXECPATH || '', opts = {}) {
  return scanBinary(execPath, pickEventArray, opts);
}

/** Đọc binary theo khối có chồng lấn, gom ứng viên qua `pick`. Xem đầu file về chi phí. */
function scanBinary(execPath, pick, { chunk = SCAN.chunk, overlap = SCAN.overlap } = {}) {
  if (!execPath || !exists(execPath)) return null;
  let fd;
  try { fd = openSync(execPath, 'r'); } catch { return null; }
  const buf = Buffer.alloc(chunk);
  let pos = 0, tail = '', best = null;
  try {
    for (;;) {
      const n = readSync(fd, buf, 0, chunk, pos);
      if (n <= 0) break;
      const s = tail + buf.toString('latin1', 0, n);
      best = pick(s, best);
      tail = s.slice(-overlap);
      pos += n;
    }
  } finally { closeSync(fd); }
  return best;
}

/** Sự kiện nào đang được CẮM trong settings.json của repo này. */
function wiredEvents() {
  const s = readJson(repoPath('.claude', 'settings.json'));
  return Object.keys(s?.hooks ?? {});
}

// ── Chạy như CLI ─────────────────────────────────────────────────────────────
//
// CHỐT ĐIỂM VÀO — bắt buộc, không phải trang trí. Thân dưới đây kết bằng `process.exit(0)`.
// Không có chốt này thì `import` file này ở BẤT KỲ đâu sẽ in một báo cáo rồi GIẾT tiến trình
// đang gọi, với mã thoát 0.
//
// Đo 2026-08-07 (#88): thêm `import { pickEventArray } from './native-surface.mjs'` vào
// `test-hooks.mjs` làm cả suite 177 ca thoát sau đúng MỘT dòng in — và thoát `0`. Suite "xanh"
// mà không chạy ca nào. Đúng lớp lỗi mà mục ghi chú của #87 vừa kể (đặt trùng tên const ⇒ suite
// im ⇒ suýt đọc "im" thành "xanh"), lặp lại ở một cơ chế khác trong cùng file, một ngày sau.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}

function runCli() {
const version = claudeCodeVersionMeasured();
const events = nativeHookEvents();
const ok = [], warn = [], na = [], unknown = [];

if (!events) {
  unknown.push('không rút được tập sự kiện từ binary — `?`, KHÔNG phải "0 sự kiện". '
    + (process.env.CLAUDE_CODE_EXECPATH
      ? `CLAUDE_CODE_EXECPATH = "${process.env.CLAUDE_CODE_EXECPATH}" nhưng không đọc/không match được mảng.`
      : 'CLAUDE_CODE_EXECPATH không được đặt.'));
} else {
  const wired = new Set(wiredEvents());
  const inUse = events.filter(e => wired.has(e));
  const empty = events.filter(e => !wired.has(e));
  // Cắm một sự kiện binary KHÔNG có nghĩa là hook đó KHÔNG BAO GIỜ chạy — và nó im lặng.
  const phantom = [...wired].filter(e => !events.includes(e));

  ok.push(`${events.length} sự kiện trong binary${version ? ` (Claude Code ${version})` : ''}`);
  ok.push(`${inUse.length} đang cắm: ${inUse.join(' · ')}`);
  na.push(`${empty.length} để trống — không phải thiếu sót, nội dung là đặc thù repo: ${empty.join(' · ')}`);
  if (phantom.length) {
    warn.push(`${phantom.length} sự kiện ĐANG CẮM mà binary KHÔNG có: ${phantom.join(' · ')} — `
      + 'hook đó không bao giờ chạy, và nó im lặng. Vendor đã đổi tên hay bỏ sự kiện?');
  }

  const prev = readJson(BASELINE, {});
  const before = prev.nativeEvents?.events;
  if (Array.isArray(before)) {
    const added = events.filter(e => !before.includes(e));
    const removed = before.filter(e => !events.includes(e));
    if (added.length || removed.length) {
      warn.push(`tập sự kiện ĐỔI so với lần ghi (${prev.nativeEvents.version ?? '?'}): `
        + `${before.length} → ${events.length}`
        + (added.length ? `  MỚI: +${added.join(' +')}` : '')
        + (removed.length ? `  BỎ: -${removed.join(' -')}` : ''));
    } else ok.push(`tập sự kiện KHÔNG đổi so với lần ghi (${prev.nativeEvents.version ?? '?'})`);
  } else {
    unknown.push('chưa từng ghi tập sự kiện — không so được. Chạy `--record` để đặt mốc.');
  }

  if (RECORD) {
    prev.nativeEvents = { version: version ?? null, at: new Date().toISOString(), events };
    writeJson(BASELINE, prev);
    ok.push(`đã ghi ${events.length} sự kiện vào .claude/claude-code-baseline.json`);
  }
}

report('BỀ MẶT NATIVE', { ok, warn, na, unknown });
if (!RECORD && events) console.log('  Đặt mốc: node tooling/native-surface.mjs --record\n');
process.exit(0);
}
