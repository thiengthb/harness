#!/usr/bin/env node
/**
 * Chặn agent sửa file generated.   PreToolUse trên Write|Edit
 *
 * Đây là hook có ROI cao nhất trong repo có codegen: không có nó, agent sẽ sửa
 * file .gen.* (vì đó là chỗ lỗi hiện ra), build sau ghi đè, và bạn mất 40 phút
 * để hiểu tại sao "sửa rồi mà vẫn lỗi".
 */
import { hookInput, toolFilePath, toRepoRel, matchAny, pathsFor, config, block, pass, telemetry } from '../../tooling/lib/harness.mjs';

const rel = toRepoRel(toolFilePath(hookInput()));
if (!rel) pass();

if (matchAny(rel, pathsFor('generated'))) {
  const gen = config().commands?.gen;
  telemetry('gate-fails', ['block-generated-edit', rel]);
  block(
    `${rel} là file generated.`,
    gen
      ? `Sửa NGUỒN (schema/template) rồi chạy: ${gen}`
      : 'Sửa nguồn sinh ra file này, không sửa output. Nếu project chưa khai báo lệnh gen, cập nhật harness.config.json → commands.gen.'
  );
}

pass();
