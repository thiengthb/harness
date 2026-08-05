#!/usr/bin/env node
/**
 * Chặn agent ghi vào file secret, và chặn secret lọt vào nội dung file thường.
 * PreToolUse trên Write|Edit
 */
import { hookInput, toolFilePath, toolContent, toRepoRel, matchAny, pathsFor, block, pass, telemetry, hookRan, SECRET_PATTERNS, declareFailMode } from '../../tooling/lib/harness.mjs';

declareFailMode(2, 'Không quét được nội dung nên không biết có secret hay không (nhóm nguy hiểm 2).');

const input = hookInput();
const rel = toRepoRel(toolFilePath(input));
if (!rel) pass();

if (matchAny(rel, pathsFor('secrets'))) {
  telemetry('gate-fails', ['block-secrets', 'file', rel]);
  block(
    `không được sửa file secret: ${rel}`,
    'Sửa file .example tương ứng, hoặc nhờ người cập nhật secret ngoài repo.'
  );
}

// SECRET_PATTERNS ở `tooling/lib/harness.mjs` — MỘT nguồn cho cả hook này và
// `precommit-scan.mjs`. Trước 2.2.0 mỗi bên một bản, và bản ở pre-commit thiếu
// Slack token + JWT: tầng gác NGƯỜI thiếu đúng hai thứ tầng gác AGENT đã có.
const content = toolContent(input);
if (content) {
  const found = SECRET_PATTERNS.find(p => p.re.test(content));
  if (found) {
    telemetry('gate-fails', ['block-secrets', 'content', `${found.name} in ${rel}`]);
    block(
      `phát hiện ${found.name} trong nội dung ghi vào ${rel}`,
      'Đưa giá trị vào biến môi trường và đọc qua config. Nếu là ví dụ, dùng placeholder rõ ràng (ví dụ: sk-xxx-PLACEHOLDER).'
    );
  }
}

hookRan('block-secrets', 'pass', rel);
pass();
