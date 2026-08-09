/**
 * Hai field, HAI CHIỀU của cùng một lớp lỗi — cả hai do máy dò `configCoverage` (#127) tìm ra.
 *
 *   limits.sessionPresenceMinutes   ĐỌC mà chưa KHAI  → thêm
 *   mcp.maxTools                    KHAI mà không ai ĐỌC → cắt
 *
 * ── VÌ SAO PHẢI CÓ MIGRATION, KHÔNG CHỈ SỬA TEMPLATE
 *
 * `harness.config.json` là lớp **SEED**: bước copy của `upgrade.mjs` KHÔNG chạm nó, nên sửa ở
 * template thì repo đã áp **không bao giờ nhận được**. Nửa THÊM là nửa quan trọng: consumer
 * đang chạy `session-start.mjs` đọc field đó, và máy dò mới sẽ báo đúng phát hiện này ở MỌI
 * repo con — một phát hiện họ không tự hiểu được nếu template im lặng.
 *
 * Tiền lệ NGƯỢC, đáng ghi vì nó là lý do file này tồn tại: 2.35.0 cắt `budget.maxToolCallsPerRun`
 * mà KHÔNG kèm migration, nên mọi consumer vẫn mang field chết đó tới hôm nay.
 *
 * ── GIÁ TRỊ KHAI PHẢI BẰNG ĐÚNG FALLBACK ĐANG CHẠY
 *
 * `session-start.mjs` gọi `limit('sessionPresenceMinutes', 240)`. Khai một số KHÁC 240 là dùng
 * một migration mang danh *"làm cho config đọc được"* để lặng lẽ **ĐỔI HÀNH VI** — người nâng
 * cấp không xin điều đó, và không gì báo cho họ. Số ở đây là 240 vì đó là số đang chạy, không
 * phải vì đó là số đúng; muốn đổi thì đổi ở config của bạn sau khi migration chạy.
 *
 * ── SỬA TEXT, KHÔNG PARSE-RỒI-STRINGIFY
 *
 * Cùng luật với migration 003: `harness.config.json` có `$comment_*` và định dạng thủ công mà
 * project có thể đã sửa. `JSON.stringify` xoá sạch chúng, và điều kiện ④ của `test-migrations`
 * ("không được mất `$comment`") sinh ra để bắt đúng chuyện đó.
 */
export const version = '2.49.0';
export const description = 'Khai `limits.sessionPresenceMinutes` (code đã đọc), cắt `mcp.maxTools` (0 nơi đọc)';

export const expect = {
  file: 'harness.config.json',
  mustContain: [
    '"sessionPresenceMinutes"',
    // Hàng xóm phải còn nguyên — đây là rủi ro thật của vá-TEXT: regex ăn quá tay.
    '"staleLockMinutes"', '"maxServers"', '$comment_limits', '$comment_mcp',
    // Phần của PROJECT phải sống sót, kể cả khi nó nằm ngay cạnh chỗ bị cắt.
    'DuAnNayTuThem',
  ],
  mustNotContain: ['"maxTools"'],
};

export async function up(ctx) {
  const { repoPath, readFileSync, writeFileSync, existsSync, log } = ctx;

  const p = repoPath('harness.config.json');
  if (!existsSync(p)) return;                    // chưa áp template — `apply-to` sẽ seed
  let s = readFileSync(p, 'utf8');
  const before = s;
  const done = [];

  // ── 1. THÊM `limits.sessionPresenceMinutes` ────────────────────────────────
  if (!/"sessionPresenceMinutes"\s*:/.test(s)) {
    // Neo vào `staleLockMinutes`: cùng khối `limits`, cùng đơn vị phút, và nó có ở mọi bản
    // config từ 1.x. Neo vào `"limits": {` thì phải đoán thụt lề của phần tử đầu.
    const m = s.match(/([ \t]*)"staleLockMinutes"\s*:\s*\d+[ \t]*,?[ \t]*\r?\n/);
    if (m) {
      const ind = m[1];
      const nl = /\r\n/.test(m[0]) ? '\r\n' : '\n';   // giữ nguyên kiểu xuống dòng của file
      s = s.replace(m[0], m[0]
        + `${ind}"$comment_sessionPresenceMinutes": "TTL của SỔ PHIÊN (.claude/state/sessions/). `
        + `Phép kiểm chính là liveness thật (process.kill(pid,0)); TTL chỉ là LƯỚI CUỐI cho ca pid bị hệ điều hành cấp lại sau reboot. `
        + `session-start.mjs ĐANG đọc field này; trước 2.49.0 nó không được khai ở đây nên 240 là hằng số cứng và người mở config để hiệu chỉnh không thấy nó tồn tại.",${nl}`
        + `${ind}"sessionPresenceMinutes": 240,${nl}`);
      done.push('khai `limits.sessionPresenceMinutes` = 240 (BẰNG ĐÚNG fallback đang chạy — không đổi hành vi)');
    } else {
      // NÓI RA khi không neo được, đừng im. Một migration bỏ qua trong im lặng để lại đúng
      // trạng thái mà máy dò sẽ báo, và người đọc không biết vì sao nó không tự sửa.
      log('⚠ không tìm thấy `limits.staleLockMinutes` để neo — KHÔNG khai `sessionPresenceMinutes`. '
        + 'Thêm tay vào khối `limits`: "sessionPresenceMinutes": 240');
    }
  }

  // ── 2. CẮT `mcp.maxTools` ──────────────────────────────────────────────────
  //
  // `"maxTools"` có dấu nháy ĐÓNG trước dấu hai chấm ⇒ nó KHÔNG khớp `"maxToolCallsPerRun"`,
  // cũng không khớp bia mộ `"$comment_da_cat_maxToolCallsPerRun"` đang nằm trong `budget`.
  const MT = /[ \t]*"maxTools"\s*:\s*\d+[ \t]*,?[ \t]*\r?\n/;
  if (MT.test(s)) {
    s = s.replace(MT, '');
    // Dấu phẩy treo, chỉ xảy ra khi `maxTools` là phần tử CUỐI của `mcp` (đúng ca ở template).
    // Phép thay này an toàn vì `,` ngay trước `}` là JSON KHÔNG hợp lệ — nó không thể tồn tại
    // trước khi ta cắt, nên nó chỉ dọn được thứ chính ta vừa tạo ra.
    s = s.replace(/,(\s*\r?\n\s*)\}/g, '$1}');
    done.push('cắt `mcp.maxTools` (0 nơi đọc; và tiền đề hết hạn — tool definition của MCP nay nạp theo yêu cầu)');
  }

  // Không đổi gì thì KHÔNG ghi lại: ghi một file "không đổi nội dung" vẫn có thể đổi byte,
  // và điều kiện ③ idempotent của `test-migrations` bắt đúng chuyện đó.
  if (s === before) return;
  writeFileSync(p, s, 'utf8');
  for (const d of done) log(`✓ ${d}`);
}
