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
