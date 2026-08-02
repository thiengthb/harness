#!/usr/bin/env node
/**
 * Lint + fix NGAY file vừa sửa.   PostToolUse trên Write|Edit
 *
 * Đây là tầng nhanh nhất của thang độ trễ phản hồi (~ms). Cùng một ESLint:
 * đặt ở đây agent tự sửa trong 200ms và không bao giờ commit lỗi đó;
 * đặt ở CI thì agent đã đi tiếp 40 phút, context đã trôi, sửa lại tốn 10x.
 */
import { writeFileSync } from 'node:fs';
import { hookInput, toolFilePath, toRepoRel, matchAny, pathsFor, runConfigured, spill, telemetry, pass, EXIT_BLOCK } from '../../tooling/lib/harness.mjs';

const rel = toRepoRel(toolFilePath(hookInput()));
if (!rel) pass();

if (!matchAny(rel, pathsFor('lintable'))) pass();
if (matchAny(rel, pathsFor('generated'))) pass();
if (/(^|\/)node_modules\//.test(rel)) pass();

const r = runConfigured('lintFix', { placeholders: { file: rel }, capture: true });
if (r.skipped) pass();

if (r.status !== 0) {
  const log = spill('lint', (r.stdout || '') + '\n' + (r.stderr || ''));
  telemetry('gate-fails', ['post-edit-lint', rel]);
  // Output NGẮN vào context; chi tiết ra file. Output dài làm bẩn context agent.
  console.error(`⛔ lint còn lỗi ở ${rel}. Sửa trước khi đi tiếp.`);
  console.error(`   Chi tiết: ${log}`);
  process.exit(EXIT_BLOCK);
}

pass();
