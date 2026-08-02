#!/usr/bin/env node
/**
 * Chặn agent SỬA TEST CHO PASS thay vì sửa code.   PreToolUse trên Write|Edit
 *
 * Đây là một dòng cụ thể trong bảng chẩn đoán lỗi (lớp Verification + Control),
 * và là chế độ hỏng tinh vi nhất: gate xanh, PR trông đẹp, và lớp bảo vệ vừa
 * bị tháo mất. Không công cụ nào khác báo.
 *
 * Cơ chế: đếm số assertion + số test block. Nếu bản ghi mới có ÍT HƠN bản trên
 * đĩa → chặn và bắt giải thích. Thêm test thì luôn được phép.
 *
 * Cửa thoát tường minh: comment `harness-allow-test-shrink` trong nội dung mới
 * (dùng khi thật sự xoá test đã lỗi thời — và nó nằm trong diff để reviewer thấy).
 */
import { readFileSync, existsSync } from 'node:fs';
import { hookInput, toolFilePath, toRepoRel, repoPath, block, pass, telemetry } from '../../tooling/lib/harness.mjs';

const input = hookInput();
const rel = toRepoRel(toolFilePath(input));
if (!rel) pass();

const IS_TEST = /(^|\/)(__tests__|tests?|spec)\//.test(rel)
  || /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel)
  || /_test\.(go|py|rb)$/.test(rel)
  || /(^|\/)test_[^/]+\.py$/.test(rel);
if (!IS_TEST) pass();

const abs = repoPath(rel);
if (!existsSync(abs)) pass();          // file test mới → luôn cho phép

const ti = input?.tool_input ?? {};
// Chỉ xử lý được khi biết TOÀN BỘ nội dung mới (Write). Edit từng phần thì bỏ qua —
// gate cuối vẫn là CI so với origin/main.
const newContent = ti.content;
if (typeof newContent !== 'string') pass();

if (/harness-allow-test-shrink/.test(newContent)) {
  console.error(`⚠️  Thu nhỏ test có chủ ý ở ${rel} — lý do phải nằm trong mô tả PR.`);
  pass();
}

let oldContent = '';
try { oldContent = readFileSync(abs, 'utf8'); } catch { pass(); }

// Chỉ đếm LỜI GỌI HÀM, không đếm từ trong văn xuôi.
// Bug đầu tiên của hook này: /\btest\b/ khớp cả chữ "test" trong comment,
// nên thêm một dòng comment cũng bị coi là mất test.
const ASSERT = /\b(expect|assert)\s*\(|\bassert\.\w+\s*\(|\.should\b|\bt\.(Error|Fatal)\w*\s*\(|\bXCTAssert\w*\s*\(|\brequire\.(Equal|NoError)\s*\(/g;
const BLOCK = /\b(it|test|describe|context)\s*\(|\bfunc\s+Test[A-Z]|\bdef\s+test_/g;
const count = (s, re) => (s.match(re) || []).length;

const oldA = count(oldContent, ASSERT), newA = count(newContent, ASSERT);
const oldB = count(oldContent, BLOCK), newB = count(newContent, BLOCK);

if (newA < oldA || newB < oldB) {
  telemetry('gate-fails', ['protect-tests', `${rel} ${oldB}→${newB} block, ${oldA}→${newA} assert`]);
  block(
    `${rel} đang MẤT test: ${oldB}→${newB} test block, ${oldA}→${newA} assertion.`,
    'Sửa CODE cho test pass, đừng sửa test cho code pass. ' +
    'Nếu test thật sự đã lỗi thời: thêm comment `harness-allow-test-shrink` và ghi lý do vào mô tả PR — ' +
    'nó sẽ nằm trong diff để reviewer thấy.'
  );
}

pass();
