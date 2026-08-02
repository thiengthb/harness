#!/usr/bin/env node
/**
 * Chặn agent tự sửa cấu hình harness của chính nó.   PreToolUse trên Write|Edit
 *
 * Hai lý do, cả hai đều quan trọng:
 *   1. BẢO MẬT — agent sửa được hook/permission của mình thì tự leo thang quyền,
 *      và sandbox thông thường không chặn được điều đó.
 *   2. TIN CẬY TRONG ĐỘI — hook đổi lặng lẽ = "agent hôm nay lạ lắm" = mất lòng tin.
 *
 * Hook này CỐ Ý cũng chặn chính vòng học: agent ĐỀ XUẤT vào .claude/learnings/,
 * người PROMOTE. Xem skill /harness-propose.
 */
import { hookInput, toolFilePath, toRepoRel, matchAny, pathsFor, config, block, pass, telemetry } from '../../tooling/lib/harness.mjs';

const rel = toRepoRel(toolFilePath(hookInput()));
if (!rel) pass();

// Cho phép: đề xuất và nhật ký — đây là đường hợp pháp để agent đóng góp
const ALLOW = ['.claude/learnings/**', '.claude/telemetry/**', 'docs/progress/**', 'knowledge/proposals/**'];
if (matchAny(rel, ALLOW)) pass();

if (matchAny(rel, pathsFor('harness'))) {
  telemetry('gate-fails', ['protect-harness', rel]);
  block(
    `${rel} là cấu hình harness của team, agent không được tự sửa.`,
    `Dùng skill /harness-propose: ghi đề xuất vào .claude/learnings/, mở issue label \`harness\`. ${config().project?.dri || 'DRI'} quyết định promote.`
  );
}

pass();
