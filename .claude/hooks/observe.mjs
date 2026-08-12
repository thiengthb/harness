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
 *   UserPromptExpansion skill nào THẬT SỰ được gọi. `/entropy-sweep` đang cắt bằng phép ĐẾM
 *                       vì nó chưa từng có dữ liệu này.
 *   SubagentStart/Stop  mẫu số của hệ số nhân ×N mà AGENTS.md đặt trần <5s dựa vào.
 *                       Cần CẢ HAI mốc — một mình `Start` không nói được "đồng thời".
 *   PermissionDenied    vendor chặn việc thật. `reason` là cột PHÂN LOẠI: trong tập giá trị
 *                       của vendor có cả `hook` — tức lần chặn của CHÍNH TA, không được gộp.
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
} else if (ev === 'UserPromptExpansion') {
  // ── SKILL NÀO THẬT SỰ ĐƯỢC GỌI (#135) ────────────────────────────────────
  //
  // `/entropy-sweep` cắt skill bằng phép ĐẾM (`12/12`) vì nó KHÔNG có dữ liệu skill nào từng
  // chạy. Phép đo duy nhất từng có là GIÁN TIẾP — suy từ artefact (*"reservations/ chỉ có
  // README ⇒ /claim chưa chạy"*) — và suy gián tiếp sai được: một skill chạy rồi bỏ giữa chừng
  // không để lại artefact nào.
  //
  // Vendor: `Exit code 2 - block expansion`. Ta KHÔNG bao giờ exit 2 ở đây (`declareFailMode(1)`),
  // nên một hook hỏng chỉ mất một dòng đo, không nuốt lệnh gõ tay của người dùng.
  telemetry('skill-calls', [
    i?.command_name ?? '?',
    i?.expansion_type ?? '?',
    String(i?.command_source ?? '?').slice(0, 40),
  ]);
} else if (ev === 'SubagentStart') {
  // ── MẪU SỐ CỦA HỆ SỐ NHÂN ×N (#136) ──────────────────────────────────────
  //
  // `AGENTS.md` đặt trần <5 giây ở `SubagentStop` với lý do *"nhân với tối đa 16 agent song
  // song"* — và con số 16 CHƯA AI ĐO. Bản rà 2.1.224 còn ghi vendor đã bỏ trần 200
  // subagent/phiên, tức hệ số nhân không còn trần vendor che chở.
  //
  // MỘT MÌNH `SubagentStart` KHÔNG ĐỦ, và nói ra chỗ đó quan trọng hơn con số: đếm được số LẦN
  // khởi động và LOẠI agent, nhưng "bao nhiêu cái chạy ĐỒNG THỜI" cần cả mốc kết thúc. Nên ô
  // này đi kèm một lời gọi `observe` thứ hai ở `SubagentStop` — xem `settings.json`.
  telemetry('subagent-runs', [i?.agent_type || '?', 'start', String(i?.agent_id ?? '').slice(0, 40)]);
} else if (ev === 'SubagentStop') {
  telemetry('subagent-runs', [i?.agent_type || '?', 'stop', String(i?.agent_id ?? '').slice(0, 40)]);
} else if (ev === 'PermissionDenied') {
  // ── VENDOR CHẶN VIỆC THẬT, VÀ HARNESS KHÔNG CÓ SỐ NÀO (#137) ──────────────
  //
  // Harness đếm được guard của CHÍNH NÓ (`gate-fails.log`); nó không có con số nào cho lần bị
  // **bộ phân loại của vendor** từ chối. Ca thật 2026-08-08: auto mode từ chối `Bash` nhiều lần
  // liên tiếp, phải đi vòng bằng Read/Grep/Glob — 0 dòng telemetry.
  //
  // `reason` LÀ CỘT PHÂN LOẠI, không phải văn xuôi trang trí. Trong tập giá trị của vendor có
  // cả `hook` — tức LẦN CHẶN CỦA CHÍNH TA. Gộp nó vào "vendor chặn việc thật" là tự đếm mình
  // hai lần và thổi phồng đúng con số đang định dùng để tranh luận (`L0005`).
  //
  // KHÔNG ghi `tool_input`: đó là chỗ một secret sẽ nằm. Vendor cũng không cho exit 2 ở ô này
  // (`Other exit codes - show stderr to user only`), nên đây thuần tuý là quan sát.
  telemetry('permission-denied', [i?.tool_name ?? '?', String(i?.reason ?? '?').slice(0, 60)]);
} else if (ev === 'PreCompact' || ev === 'SessionEnd') {
  // ── MỐC MẤT CONTEXT (#130) ────────────────────────────────────────────────
  //
  // `/handoff` là thủ công, và `rituals` đo được nó **chưa chạy lần nào** kể từ khi harness ra
  // đời. Khi context bị nén hoặc phiên kết thúc, **0 byte** được ghi tự động — thứ duy nhất
  // sống sót là những gì người dùng nhớ gõ.
  //
  // GHI MỘT MỐC, KHÔNG GHI MỘT BẢN SAO. Cám dỗ là chụp lại trạng thái git (nhánh, HEAD, số file
  // bẩn) vào đây. Không làm: mỗi lời gọi `git` là một process nữa ở đúng lúc phiên đang nặng,
  // và `rituals.collect()` ĐÃ đọc hết những thứ đó ở phiên sau — chép lại là dựng bản sao thứ
  // hai của một sự thật, đúng thứ #125 đã trả giá.
  //
  // Thứ CHỈ ở đây mới biết là **THỜI ĐIỂM** context biến mất. Đó là toàn bộ nội dung file này.
  try {
    writeJson(join(stateDir(), 'last-context-loss.json'), {
      at: new Date().toISOString(),
      event: ev,
      why: String(i?.trigger ?? i?.reason ?? '?').slice(0, 40),
    });
  } catch {}
  // ĐÃ ĐO, CỐ Ý KHÔNG DÙNG: vendor khai `PreCompact` → *"Exit code 0 - stdout appended as custom
  // compact instructions"*, tức mọi thứ in ra đây trở thành CHỈ THỊ cho phép nén. Mạnh hơn hẳn
  // thứ issue hình dung — và vì thế nó không thuộc file này: `observe.mjs` khai ở dòng đầu là
  // *"quan sát, không quyết định gì"*, còn lái phép nén là một quyết định, và là một quyết định
  // KHÔNG có cách kiểm tất định nào. Ghi lại để nó không bị phát hiện lại lần thứ hai.
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
