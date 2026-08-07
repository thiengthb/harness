#!/usr/bin/env node
/**
 * Lint + fix NGAY file vừa sửa.   PostToolUse trên Write|Edit
 *
 * Đây là tầng nhanh nhất của thang độ trễ phản hồi (~ms). Cùng một ESLint:
 * đặt ở đây agent tự sửa trong 200ms và không bao giờ commit lỗi đó;
 * đặt ở CI thì agent đã đi tiếp 40 phút, context đã trôi, sửa lại tốn 10x.
 */
import { writeFileSync } from 'node:fs';
import { hookInput, toolFilePath, toRepoRel, matchAny, pathsFor, runConfigured, spill, telemetry, hookRan, pass, EXIT_BLOCK, declareFailMode } from '../../tooling/lib/harness.mjs';

declareFailMode(1, 'Không lint được file vừa ghi. PostToolUse không chặn được gì, và lint còn chạy lại ở gate.');

const rel = toRepoRel(toolFilePath(hookInput()));
if (!rel) pass();

if (!matchAny(rel, pathsFor('lintable'))) pass();
if (matchAny(rel, pathsFor('generated'))) pass();
if (/(^|\/)node_modules\//.test(rel)) pass();

const r = runConfigured('lintFix', { placeholders: { file: rel }, capture: true });
if (r.skipped) { hookRan('post-edit-lint', 'skip', 'chưa khai commands.lintFix'); pass(); }

if (r.status !== 0) {
  const log = spill('lint', (r.stdout || '') + '\n' + (r.stderr || ''));
  telemetry('gate-fails', ['post-edit-lint', rel]);
  // Output NGẮN vào context; chi tiết ra file. Output dài làm bẩn context agent.
  //
  // KHÔNG viết "BỊ CHẶN" ở đây, cố ý. Đây là `PostToolUse`: file ĐÃ ghi xong rồi, nên câu đó
  // sai sự thật — không có gì bị chặn cả, chỉ là việc TIẾP THEO bị dừng. Hợp đồng output ở
  // `tooling/test-hooks.mjs` biết sự kiện: `PreToolUse` phải nói `BỊ CHẶN`, `PostToolUse` phải
  // có `⛔`, và CẢ HAI phải có dòng gợi ý `→ `.
  //
  // Dòng `→ ` là thứ agent đọc để biết làm gì tiếp — thiếu nó thì hook chỉ nói "không", và
  // một hook chỉ nói "không" là một hook đẩy agent đi đoán. Đó là chỗ nhánh này từng lệch.
  console.error(`⛔ lint còn lỗi ở ${rel} — file ĐÃ ghi, việc tiếp theo dừng ở đây.`);
  console.error(`   Chi tiết: ${log}`);
  console.error(`   → sửa lỗi lint trong ${rel} rồi ghi lại file; hook chạy lại và tự thông.`);
  process.exit(EXIT_BLOCK);
}

hookRan('post-edit-lint', 'pass', rel);
pass();
