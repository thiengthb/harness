#!/usr/bin/env node
/**
 * Chặn agent tự sửa cấu hình harness của chính nó.   PreToolUse trên Write|Edit
 *
 * ĐÂY LÀ CƠ CHẾ KỶ LUẬT ĐỘI, KHÔNG PHẢI RANH GIỚI BẢO MẬT.
 * Nói rõ vì đây là chỗ dễ tự lừa mình nhất: hook này chỉ khớp Write|Edit.
 * Một agent có quyền Bash vẫn ghi được file bằng shell. `dcg.mjs` chặn các dạng
 * ghi qua shell phổ biến, nhưng không thể chặn hết — một agent quyết tâm thì
 * luôn có đường. Ranh giới bảo mật thật nằm ở tầng OS: sandbox, permission,
 * và credential không reachable từ nơi chạy code do model sinh.
 *
 * Giá trị thật của hook này là hai thứ khác, và cả hai đều đáng:
 *   1. Nó biến "đổi harness" thành một hành động CÓ Ý THỨC, không phải một
 *      edit tiện tay giữa lúc đang sửa bug.
 *   2. Nó giữ LÒNG TIN trong đội — hook đổi lặng lẽ = "agent hôm nay lạ lắm".
 *
 * CỬA THOÁT CHO DRI:
 *   HARNESS_DRI=1  → cho phép, và GHI LOG vào .claude/telemetry/harness-edits.log
 * Cửa thoát này tường minh và audit được. Không có nó, DRI không dùng được agent
 * để bảo trì chính harness — và một harness không bảo trì được sẽ mục.
 */
import { hookInput, toolFilePath, toRepoRel, matchAny, pathsFor, config, block, pass, telemetry, hookRan, currentBranch, declareFailMode } from '../../tooling/lib/harness.mjs';

declareFailMode(2, 'Không kiểm được đường dẫn có thuộc cấu hình harness không. Một agent sửa được luật của chính nó làm mọi luật còn lại vô nghĩa.');

const rel = toRepoRel(toolFilePath(hookInput()));
if (!rel) pass();

// Cho phép: đề xuất và nhật ký — đây là đường hợp pháp để agent đóng góp
const ALLOW = ['.claude/learnings/**', '.claude/telemetry/**', 'docs/progress/**', 'knowledge/proposals/**'];
if (matchAny(rel, ALLOW)) pass();

if (!matchAny(rel, pathsFor('harness'))) pass();

if (process.env.HARNESS_DRI === '1') {
  telemetry('harness-edits', [currentBranch(), rel, process.env.DEV_ID || process.env.USER || '?']);
  hookRan('protect-harness', 'pass', `dri:${rel}`);
  console.error(`⚠️  Sửa harness với quyền DRI: ${rel}`);
  console.error('   Đã ghi .claude/telemetry/harness-edits.log.');
  console.error('   Nhớ: cập nhật .claude/whats-new.md và thêm case vào tooling/test-hooks.mjs nếu đổi hook.');
  pass();
}

telemetry('gate-fails', ['protect-harness', rel]);
block(
  `${rel} là cấu hình harness của team, agent không được tự sửa.`,
  `Dùng skill /harness-propose: ghi đề xuất vào .claude/learnings/, mở issue label \`harness\`. ` +
  `${config().project?.dri || 'DRI'} quyết định promote. ` +
  `Nếu BẠN là DRI và đang chủ ý bảo trì harness: đặt HARNESS_DRI=1 (sẽ được ghi log).`
);
