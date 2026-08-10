#!/usr/bin/env node
/**
 * AGENT GIẢ — để `tooling/test-evals.mjs` kiểm `runAgent()` mà KHÔNG tốn một token nào.
 *
 * VÌ SAO CẦN NÓ. `runAgent()` trong `evals/run.mjs` chỉ chạy khi có người điền
 * `evals.command`, và **chưa repo nào từng điền** (đo 2026-08-05: rỗng ở cả bốn repo). Nên
 * ~40 dòng lo thay placeholder, cắt wall-clock, và đếm retry là code **chưa bao giờ chạy**.
 *
 * Chế độ hỏng của nó là loại tệ nhất để phát hiện: nếu `{prompt}` thay sai, MỌI eval fail
 * cùng lúc — và triệu chứng đọc y hệt "model vừa tụt hạng". Người ta sẽ đi tìm nguyên nhân
 * ở model, không ở runner. Một lớp inferential control gác một bug computational.
 *
 * Không thể kiểm bằng cách gọi model thật: tốn tiền, cần mạng, và kết quả không tất định —
 * ba lý do làm nó không bao giờ vào CI. Agent giả thì tất định và miễn phí, và nó kiểm đúng
 * phần thuộc về HARNESS: thay placeholder, timeout, đếm retry, map exit code.
 *
 * Chế độ điều khiển bằng `FAKE_AGENT_MODE`:
 *   ok    (mặc định)  in ra argv nhận được rồi exit 0
 *   fail              exit 3 — runner phải đánh task là FAIL
 *   loop              in MỘT dòng dài giống hệt 5 lần — runner phải thấy "vòng lặp mù"
 *   hang              ngủ lâu hơn wall-clock cap — runner phải cắt và báo timedOut
 *   quota             in chữ ký hết-quota rồi exit 0 — runner phải báo `?`, KHÔNG phải FAIL
 *   maxturns          in chữ ký cạn-trần-lượt rồi exit 1 — runner phải báo `?`, KHÔNG phải FAIL
 *   writes            SỬA một file trong cây — runner phải RÚT patch ra trước khi xoá cây
 *   json              in PHONG BÌ thành công (num_turns) — runner phải ĐỌC ĐƯỢC số lượt
 *   jsonmaxturns      in PHONG BÌ cạn trần lượt — `?` mà KHÔNG có chữ "Reached max turns" nào
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const mode = process.env.FAKE_AGENT_MODE || 'ok';

// In NGUYÊN VĂN những gì nhận được: test khẳng định trên đây, nên nó là hợp đồng.
console.log('FAKE_AGENT_ARGV=' + JSON.stringify(process.argv.slice(2)));

// CHẠY Ở ĐÂU, và THẤY GÌ TỪ ĐÓ. Hai dòng này là hợp đồng của chế độ `--bare` (#91): trước
// 2.42.5, `--bare` đổi tiêu đề và tên file baseline nhưng `spawnSync` vẫn dùng `cwd` của repo
// thật với đúng bộ hook — nên hai lần chạy đo cùng một thứ. Một agent giả không tự biết nó
// "trần" hay không; cách duy nhất kiểm được điều đó từ ngoài là bắt nó khai chỗ nó đứng và
// những gì còn đọc được từ chỗ đó.
console.log('FAKE_AGENT_CWD=' + JSON.stringify(process.cwd()));
console.log('FAKE_AGENT_SEES=' + JSON.stringify(
  ['AGENTS.md', 'CLAUDE.md', '.claude/settings.json', '.claude/rules', 'harness.config.json', 'tooling']
    .filter(p => existsSync(p))));

// Prompt tới qua STDIN (từ 2.7.8). Đọc đồng bộ để không phụ thuộc thứ tự event loop.
let stdin = '';
try { stdin = readFileSync(0, 'utf8'); } catch {}
console.log('FAKE_AGENT_STDIN=' + JSON.stringify(stdin));

if (mode === 'fail') process.exit(3);

// Hết quota — CHỮ KÝ THẬT, chép nguyên văn từ lần chạy 2026-08-07 (issue #93). Chi tiết quyết
// định: nó in ra rồi **exit 0**. Một agent chết vì quota trông y hệt một agent chạy xong, nên
// exit code KHÔNG phân biệt được — chỉ nội dung mới phân biệt được.
if (mode === 'quota') {
  console.log("You've hit your session limit · resets 12am (Asia/Saigon)");
  process.exit(0);
}

// Cạn trần LƯỢT — chữ ký NGUYÊN VĂN từ lần đo 2026-08-10 (#147), không phải bịa. Hai chi
// tiết quyết định, và cả hai khác `quota`: nó in ra **stdout** (transcript thật cho thấy chữ
// nằm TRƯỚC mốc `--- stderr ---`), và nó exit **1**. Chính exit-code khác 0 đó là thứ đẩy task
// vào rổ FAIL trước bản vá — nên một agent giả exit 0 sẽ không tái tạo được bug.
if (mode === 'maxturns') {
  console.log('Error: Reached max turns (6)');
  process.exit(1);
}

// PHONG BÌ — hình dạng chép NGUYÊN VĂN từ `claude -p --output-format json`, đo 2026-08-10
// (#153). Rút gọn còn những trường runner đọc, cộng vài trường nó KHÔNG đọc (`stop_reason`,
// `usage`) để chứng minh phép đọc không vỡ vì trường lạ.
//
// `FAKE_AGENT_TURNS` cho test chọn số lượt: ca "trần sắp bó" cần một con số SÁT trần, ca
// thường cần một con số rộng rãi, và hai ca đó phải khác nhau ở ĐÚNG con số đó.
if (mode === 'json' || mode === 'jsonmaxturns') {
  const max = mode === 'jsonmaxturns';
  console.log(JSON.stringify({
    is_error: max,
    duration_api_ms: 9726,
    num_turns: Number(process.env.FAKE_AGENT_TURNS || (max ? 2 : 3)),
    stop_reason: max ? 'tool_use' : 'end_turn',
    session_id: 'fake-0000',
    total_cost_usd: 0.044967,
    usage: { input_tokens: 2, output_tokens: 127 },
    permission_denials: [],
    terminal_reason: max ? 'max_turns' : 'completed',
    subtype: max ? 'error_max_turns' : 'success',
    // `FAKE_AGENT_SAY` nhét chữ vào CÂU TRẢ LỜI của agent. Nó tồn tại cho đúng một ca: agent
    // NÓI VỀ chữ ký ngân sách trong lúc chạy xong bình thường. Ở chế độ JSON, câu trả lời nằm
    // trong cùng dòng stdout với phong bì — nên một runner còn quét văn xuôi sẽ chấm ca này là
    // "cạn ngân sách" và đẩy một task XANH ra khỏi mẫu số, im lặng.
    ...(max ? {} : { result: process.env.FAKE_AGENT_SAY || 'OK.' }),
  }));
  process.exit(max ? 1 : 0);
}

// SỬA CÂY — agent làm việc thật, như agent thật đã làm hai lần (PR #149, #157). Từ #155 cây
// là clone dùng một lần, nên nếu runner không RÚT patch ra trước khi xoá thì việc này biến mất
// không dấu vết. Ghi vào một file CÓ SẴN chứ không tạo file mới: `git diff` bắt được cả hai,
// nhưng file có sẵn chứng minh luôn rằng cây là bản sao THẬT của repo, không phải thư mục rỗng.
//
// ── VÀ NÓ TỪ CHỐI GHI VÀO REPO THẬT, KỂ CẢ KHI ĐƯỢC BẢO GHI ──────────────────
//
// Đây không phải cẩn thận thừa. Đo 2026-08-10, ngay trong lượt mutation của chính #155: mutant
// N2 (*"chỉ chiều trần mới cô lập"* — tức hành vi CŨ) làm `cwd` quay về repo thật, và chế độ
// này **ghi thẳng vào `AGENTS.md` của repo** — một file trong VÙNG CẤM. Ca test đỏ đúng như
// thiết kế, nhưng thiệt hại đã xảy ra rồi, và script mutation chỉ khôi phục file nó tự sửa.
//
// Bài học không phải *"viết script mutation cẩn thận hơn"*: một fixture chỉ an toàn khi cơ chế
// nó đang kiểm còn hoạt động thì **không phải một fixture an toàn** — nó là một cái bẫy chờ
// đúng lúc cơ chế hỏng. Nên nó tự gác: `FAKE_AGENT_FORBID_CWD` do test truyền vào, và ở đây
// chỉ có một việc — KHÔNG GHI, và nói to.
if (mode === 'writes') {
  const forbid = process.env.FAKE_AGENT_FORBID_CWD;
  if (forbid && resolve(process.cwd()) === resolve(forbid)) {
    console.log('FAKE_AGENT_REFUSED=' + JSON.stringify(`đang đứng trong repo THẬT (${process.cwd()}) — cô lập đã hỏng, KHÔNG ghi`));
    process.exit(0);
  }
  writeFileSync('AGENTS.md', readFileSync('AGENTS.md', 'utf8') + '\nDÒNG DO AGENT GIẢ THÊM\n', 'utf8');
  console.log('Đã sửa AGENTS.md.');
  process.exit(0);
}

if (mode === 'loop') {
  const line = 'Tôi thử lại bước này một lần nữa vì lần trước chưa thành công — dòng dài hơn 30 ký tự';
  for (let i = 0; i < 5; i++) console.log(line);
  process.exit(0);
}

if (mode === 'hang') {
  // Ngủ CHẶN, không dùng timer: `spawnSync` cắt tiến trình bằng SIGTERM, và một tiến trình
  // đang ngủ bằng Atomics.wait vẫn bị cắt — nhưng nó không tự thoát sớm như setTimeout khi
  // event loop rỗng. Đây là mô phỏng gần nhất với một agent đang treo thật.
  const sab = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(sab, 0, 0, 60_000);
  process.exit(0);
}

process.exit(0);
