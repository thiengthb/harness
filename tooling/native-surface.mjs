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
export function nativeHookEvents(execPath = process.env.CLAUDE_CODE_EXECPATH || '') {
  if (!execPath || !exists(execPath)) return null;
  const CHUNK = 8 * 1024 * 1024, OVERLAP = 8192;
  const RE = /\[(?:\s*["'][A-Z][A-Za-z]{3,30}["']\s*,){6,}\s*["'][A-Z][A-Za-z]{3,30}["']\s*\]/g;
  let fd;
  try { fd = openSync(execPath, 'r'); } catch { return null; }
  const buf = Buffer.alloc(CHUNK);
  let pos = 0, tail = '', best = null;
  try {
    for (;;) {
      const n = readSync(fd, buf, 0, CHUNK, pos);
      if (n <= 0) break;
      const s = tail + buf.toString('latin1', 0, n);
      for (const m of s.matchAll(RE)) {
        if (!m[0].includes('PreToolUse')) continue;
        try {
          const arr = JSON.parse(m[0].replace(/'/g, '"'));
          // Lấy mảng DÀI NHẤT: bundle có thể chứa nhiều tập con (ví dụ danh sách sự kiện của
          // một tính năng con). Tập đầy đủ là tập bao trùm.
          if (!best || arr.length > best.length) best = arr;
        } catch { /* không parse được thì bỏ qua ứng viên này */ }
      }
      tail = s.slice(-OVERLAP);
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
