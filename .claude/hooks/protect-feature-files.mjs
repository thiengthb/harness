#!/usr/bin/env node
/**
 * Bảo vệ features/*.json.   PreToolUse trên Write|Edit
 *
 * feature_list.json một-file-cho-cả-repo là thiết kế SINGLE-WRITER: hoàn hảo khi
 * làm một mình, là máy sinh conflict khi có 4 người. Ở đây nó được chẻ theo feature,
 * và hook này cưỡng chế "mỗi nhánh chỉ sửa feature của issue mình đang làm".
 */
import { readFileSync } from 'node:fs';
import { hookInput, toolFilePath, toRepoRel, currentBranch, issueFromBranch, config, block, pass, repoPath, readJson, telemetry, hookRan, declareFailMode } from '../../tooling/lib/harness.mjs';

declareFailMode(2, 'Không xác định được file feature này thuộc issue nào — ghi đè việc của đồng đội là thiệt hại họ không dựng lại được.');

const rel = toRepoRel(toolFilePath(hookInput()));
if (!rel.startsWith('features/')) pass();

if (rel.endsWith('_index.json')) {
  block(
    'features/_index.json do DRI quản lý.',
    `Mở PR riêng nếu cần thêm/xoá feature. Nhắc ${config().project?.dri || 'DRI'}.`
  );
}

const branch = currentBranch();
const issue = issueFromBranch(branch);
if (!issue) pass(); // nhánh không theo quy ước (ví dụ main) → không chặn, chỉ nhắc ở nơi khác

const target = readJson(repoPath(rel));
if (target?.issue && target.issue !== issue) {
  telemetry('gate-fails', ['protect-feature-files', `${rel} thuộc ${target.issue}, branch ${issue}`]);
  block(
    `${rel} thuộc issue ${target.issue}, nhưng nhánh hiện tại là ${issue}.`,
    'Một issue = một nhánh = một feature file. Nếu thật sự phải sửa chéo, tách PR riêng và nói rõ trong mô tả.'
  );
}

hookRan('protect-feature-files', 'pass', rel);
pass();
