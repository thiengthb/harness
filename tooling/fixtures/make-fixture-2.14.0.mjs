#!/usr/bin/env node
/**
 * Dựng lại `tooling/fixtures/migration-2.14.0/`.
 *
 *   node tooling/fixtures/make-fixture-2.14.0.mjs tooling/fixtures/migration-2.14.0
 *
 * VÌ SAO LÀ SCRIPT, KHÔNG PHẢI FILE GÕ TAY. Fixture này neo vào `sha` trong manifest, và
 * `sha` phải KHỚP nội dung file thật. Sai một ký tự thì migration 010 coi là "người dùng đã
 * sửa" ⇒ KHÔNG xoá ⇒ **fixture xanh mà không kiểm được gì**. Đó là chế độ hỏng tệ nhất cho
 * một test: nó vẫn chạy, vẫn xanh, và không còn khẳng định điều nó được viết ra để khẳng định.
 *
 * Fixture của 2.11.0 đã gặp đúng rủi ro này và giải bằng một script — nhưng script đó nằm
 * trong `scratchpad/`, tức KHÔNG được commit, nên không ai dựng lại được. Cái này ở trong repo.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('Cách dùng: node tooling/fixtures/make-fixture-2.14.0.mjs <thư-mục-đích>');
  process.exit(1);
}

// Ba nhóm, mỗi nhóm khẳng định một điều khác nhau:
//   · file ở GỐC repo        → bia mộ xoá được một file lẻ, không chỉ thư mục
//   · thư mục NHIỀU file     → bia mộ xoá được cả cây
//   · file của PROJECT       → và nó DỪNG TAY ở đó
const FILES = {
  'HARNESS-CHANGELOG.md': '# Changelog của lớp harness\n\n## 2.13.0\nNội dung giả lập cho fixture.\n',
  'harness-migrations/001-vi-du.mjs': "export const version = '1.0.0';\nexport async function up() {}\n",
  'harness-migrations/002-vi-du.mjs': "export const version = '1.1.0';\nexport async function up() {}\n",
  'docs/cua-project.md': '# Tài liệu của project — KHÔNG được xoá\n',
};

for (const [rel, body] of Object.entries(FILES)) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body, 'utf8');
}

// Cùng phép băm với `apply-to.mjs` và `upgrade.mjs`: sha256, 16 ký tự đầu.
const sha = rel => createHash('sha256').update(readFileSync(join(root, rel))).digest('hex').slice(0, 16);

mkdirSync(join(root, '.claude'), { recursive: true });
writeFileSync(join(root, '.claude', 'harness-manifest.json'), JSON.stringify({
  $comment: 'FIXTURE của bia mộ 2.14.0 (HARNESS-CHANGELOG.md + harness-migrations/). NEO: mọi `sha` '
    + 'phải ĐÚNG với nội dung file — sai sha thì migration 010 coi là "người dùng đã sửa" và KHÔNG xoá, '
    + 'fixture xanh mà không kiểm gì. Sinh lại: node tooling/fixtures/make-fixture-2.14.0.mjs <đích>. '
    + '`docs/cua-project.md` CỐ Ý không có trong manifest: nó là file của project, và nó phải sống sót.',
  templateVersion: '2.13.0',
  appliedAt: '2026-08-06T00:00:00.000Z',
  files: {
    'HARNESS-CHANGELOG.md': sha('HARNESS-CHANGELOG.md'),
    'harness-migrations/001-vi-du.mjs': sha('harness-migrations/001-vi-du.mjs'),
    'harness-migrations/002-vi-du.mjs': sha('harness-migrations/002-vi-du.mjs'),
  },
}, null, 2) + '\n', 'utf8');

console.log(`✓ fixture dựng lại ở ${root}`);
