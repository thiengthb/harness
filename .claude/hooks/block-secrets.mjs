#!/usr/bin/env node
/**
 * Chặn agent ghi vào file secret, và chặn secret lọt vào nội dung file thường.
 * PreToolUse trên Write|Edit
 */
import { hookInput, toolFilePath, toolContent, toRepoRel, matchAny, pathsFor, block, pass, telemetry, hookRan } from '../../tooling/lib/harness.mjs';

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

const SECRET_PATTERNS = [
  { re: /\bsk-[A-Za-z0-9_-]{20,}/, name: 'API key dạng sk-' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, name: 'AWS access key' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, name: 'private key' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{30,}/, name: 'GitHub token' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, name: 'Slack token' },
  { re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, name: 'JWT' },
  { re: /(postgres|mysql|mongodb(\+srv)?):\/\/[^\s:@/]+:[^\s@/]+@/, name: 'connection string có mật khẩu' },
];

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
