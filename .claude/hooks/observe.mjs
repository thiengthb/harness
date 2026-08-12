#!/usr/bin/env node
/**
 * QUAN SÁT — không bao giờ chặn.   Dispatch theo `hook_event_name`.
 *
 * Gộp ba việc *quan sát, không bao giờ chặn* vào MỘT file thay vì ba. Chúng cùng
 * một nghề: ghi lại, không quyết định gì.
 *
 *   InstructionsLoaded  THIẾT BỊ ĐO. Trả lời câu mà harness-size.mjs chỉ ƯỚC LƯỢNG
 *                       được: file chỉ thị nào THẬT SỰ nạp, lúc nào, vì sao.
 *                       Ước lượng bằng grep là chỗ đã sai nhiều lần.
 *                       Vendor khai: observability-only, KHÔNG hỗ trợ chặn.
 *   StopFailure         LỚP KINH TẾ — lớp duy nhất gây thiệt hại tài chính trực tiếp.
 *                       Trước đây `budget.*` là con số không ai đọc; đây là chỗ
 *                       vendor GỌI cho ta khi tiền hoặc quota chạm trần.
 *                       KHÔNG cố dừng session — hook không dừng được API error.
 *   SessionStart        kiểm dây auto-memory (xem AGENTS.md §Hai bộ nhớ).
 *   PostToolUseFailure  em họ TỰ ĐỘNG của `fixlog` — tầng CAPTURE thôi dựa vào trí nhớ.
 *                       `is_interrupt` tách riêng: người bấm dừng KHÔNG phải công cụ hỏng.
 *   Notification        ma sát người↔agent. `idle_prompt` là SỐ LẦN VƯỢT NGƯỠNG của máy này,
 *                       KHÔNG phải thời lượng chờ — vendor không gửi thời lượng.
 *
 * ── VÌ SAO StopFailure GHI FILE CHỨ KHÔNG IN
 * Vendor khai StopFailure là **fire-and-forget: hook output VÀ exit code bị BỎ QUA**
 * (verified trong schema hook nhúng ở binary CLI 2.1.221 — xem ADR 0002 §Nguồn).
 * Nên `console.error` ở nhánh đó là chữ chết: nó không tới được mắt ai. Ta ghi một
 * mẩu bánh mì vào `.claude/state/last-stop-failure.json`; `session-start.mjs` đọc và
 * in nó MỘT LẦN ở phiên sau. Đó là toàn bộ giá trị của nhánh này — một cảnh báo về
 * TIỀN mà không ai đọc thì bằng không có cảnh báo.
 *
 * ĐIỀU KIỆN THOÁT (InstructionsLoaded): thuế context ổn định dưới ngưỡng 2 quý liên
 * tiếp thì gỡ nhánh đó — nó là thiết bị đo, không phải gate.
 * ĐIỀU KIỆN THOÁT (StopFailure): khi org bật spend limit cứng ở gateway.
 */
import { hookInput, telemetry, hookRan, unattended, config, pass, stateDir, writeJson, declareFailMode } from '../../tooling/lib/harness.mjs';
import { join } from 'node:path';

declareFailMode(1, 'Không ghi được quan sát. Hook này CỐ Ý không bao giờ chặn — mất một dòng đo không đáng đổi bằng một lệnh bị chặn.');

const i = hookInput();
const ev = i?.hook_event_name ?? '';

// Enum `error` của vendor có 10 giá trị. Chỉ vài giá trị nói về TIỀN hoặc QUOTA; phần
// còn lại là lỗi kỹ thuật (server_error, invalid_request, model_not_found…). Gộp cả
// hai thành một cảnh báo "hoá đơn" là cách chắc chắn làm người ta phớt lờ nó.
//
// Matcher trong settings.json là `*`, KHÔNG phải danh sách lỗi tiền. Cố ý: một báo
// động về tiền im lặng vì matcher hụt là chế độ hỏng tệ nhất của lớp này. Lọc ở ĐÂY,
// nơi sai thì thấy được, đừng lọc ở chỗ sai thì im.
const MONEY = /rate_limit|billing|credit|quota|max_output_tokens|oauth_org_not_allowed/i;

if (ev === 'InstructionsLoaded') {
  // Im lặng — thiết bị đo không bình luận. Trường theo schema vendor:
  // file_path · memory_type (User|Project|Local|Managed) · load_reason
  // (session_start|nested_traversal|path_glob_match|include|compact) · globs.
  telemetry('instructions-loaded', [
    i?.load_reason ?? '?',
    i?.memory_type ?? '?',
    i?.file_path ?? '?',
    Array.isArray(i?.globs) ? i.globs.join(' ') : '',
  ]);
} else if (ev === 'StopFailure') {
  const err = String(i?.error ?? i?.error_type ?? i?.reason ?? '?');
  const money = MONEY.test(err);
  telemetry('budget-alarm', [err, money ? 'money' : 'technical', unattended() ? 'unattended' : 'attended']);
  if (money) {
    // Mẩu bánh mì cho phiên SAU. Chỉ ghi nhánh TIỀN: một `server_error` thoáng qua
    // không đáng làm người ta giật mình ở phiên sau, và một cảnh báo hay kêu oan
    // sẽ bị bỏ qua đúng lúc nó kêu thật.
    try {
      writeJson(join(stateDir(), 'last-stop-failure.json'), {
        error: err,
        at: new Date().toISOString(),
        unattended: unattended(),
      });
    } catch {}
  }
} else if (ev === 'PostToolUseFailure') {
  // ── CÔNG CỤ HỎNG — em họ TỰ ĐỘNG của `fixlog` (#132) ──────────────────────
  //
  // `fixlog` là *"3 giây người phải NHỚ gõ"*, tức tầng CAPTURE của vòng học đang dựa vào trí
  // nhớ. Đây là phần máy ghi được mà không ai phải nhớ gì.
  //
  // `is_interrupt` LÀ MỘT CỘT RIÊNG, không gộp. Đo từ binary 2.1.228, schema vendor:
  //   { tool_name, tool_input, tool_use_id, error, is_interrupt?: bool, duration_ms?: number }
  // `is_interrupt` nghĩa là NGƯỜI bấm dừng — đó không phải một công cụ hỏng, đó là một quyết
  // định. Gộp hai thứ vào một bộ đếm là đúng lớp lỗi `L0005`: một con số không phân biệt được
  // hai trạng thái sẽ đổ về phía dễ chịu, và ở đây phía dễ chịu là *"công cụ này hay hỏng"*
  // trong khi sự thật là *"tôi hay bấm dừng nó"*.
  //
  // KHÔNG ghi `tool_input`: đó là chỗ một secret sẽ nằm nếu nó nằm ở đâu đó. `error` cắt 120 ký
  // tự — cùng ngưỡng `dcg` dùng cho `cmd`, cùng lý do.
  const ms = Number(i?.duration_ms);
  telemetry('tool-failures', [
    i?.tool_name ?? '?',
    i?.is_interrupt === true ? 'interrupt' : 'error',
    String(i?.error ?? '?').slice(0, 120),
    Number.isFinite(ms) ? String(Math.round(ms)) : '?',
  ]);
} else if (ev === 'Notification') {
  // ── MA SÁT NGƯỜI ↔ AGENT (#132) ───────────────────────────────────────────
  //
  // Schema đo từ binary: { message, title?, notification_type }. Matcher của vendor là
  // `notification_type`, nhưng ta để `*` trong settings.json và lọc/phân loại Ở ĐÂY — cùng lý
  // do với `MONEY` phía trên: matcher hụt thì tín hiệu im, và im là chế độ hỏng tệ nhất.
  //
  // GIỚI HẠN PHẢI NÓI RA, và nó bác một nửa câu hỏi gốc của issue. `idle_prompt` KHÔNG mang
  // thời lượng: binary bắn nó khi thời gian chờ vượt `messageIdleNotifThresholdMs` — một ngưỡng
  // NGƯỜI DÙNG chỉnh được. Nên con số này là *"số lần vượt ngưỡng CỦA MÁY NÀY"*, không phải
  // *"agent đợi bao lâu"*, và nó KHÔNG so được giữa hai máy khác ngưỡng.
  //
  // Ghi nó thay vì bỏ qua: một phép đếm có ngưỡng riêng vẫn đọc được XU HƯỚNG trên cùng một
  // máy — đúng thứ CAPO-TRẦN đã làm với `rateLimitHits`. Thứ KHÔNG được làm là gọi nó là "thời
  // gian chờ".
  telemetry('notifications', [
    i?.notification_type ?? '?',
    unattended() ? 'unattended' : 'attended',
    String(i?.title ?? i?.message ?? '').slice(0, 80),
  ]);
} else if (ev === 'SessionStart') {
  // Auto-memory là quan sát THÔ, máy-cục-bộ, được phép sai. Trỏ nó vào cây repo là
  // biến quan sát chưa kiểm của MỘT người thành chỉ thị cho CẢ ĐỘI — và nó nạp 200
  // dòng đầu MEMORY.md MỖI phiên, nên nó là chỉ thị thật, không phải ghi chú bên lề.
  const dir = config().knowledge?.autoMemoryDirectory;
  if (dir && !/^[~/]|^[A-Za-z]:/.test(String(dir))) {
    console.error('⚠️  knowledge.autoMemoryDirectory trỏ vào CÂY REPO. Auto-memory là quan sát');
    console.error('   THÔ, máy-cục-bộ, được phép sai. Commit nó = biến quan sát chưa kiểm của');
    console.error('   MỘT người thành chỉ thị cho CẢ ĐỘI. Để RỖNG là đúng: mặc định của vendor');
    console.error('   (~/.claude/projects/<repo>/memory/) nằm NGOÀI repo — xem knowledge/README.md.');
  }
}

hookRan('observe', 'pass', ev || 'sự-kiện-không-rõ');
pass();   // không bao giờ chặn — với MỌI sự kiện, kể cả sự kiện không nhận ra
