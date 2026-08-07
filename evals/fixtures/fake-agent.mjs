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
 */
import { readFileSync } from 'node:fs';

const mode = process.env.FAKE_AGENT_MODE || 'ok';

// In NGUYÊN VĂN những gì nhận được: test khẳng định trên đây, nên nó là hợp đồng.
console.log('FAKE_AGENT_ARGV=' + JSON.stringify(process.argv.slice(2)));

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
