#!/usr/bin/env node
/**
 * Điểm vào khi bạn CHƯA có harness trên máy.
 *
 *   npx github:thiengthb/harness init            áp vào thư mục hiện tại
 *   npx github:thiengthb/harness init ./my-app
 *
 * `npx` tự tải repo về cache của nó rồi chạy file này — nên bạn không phải clone gì.
 * Mọi thứ SAU bước đó chạy bằng bản đã copy vào project: `node tooling/setup.mjs`,
 * `node tooling/harness-doctor.mjs`, `node tooling/upgrade.mjs`.
 *
 * File này CỐ Ý mỏng. Nó không có logic riêng — nó gọi `apply-to.mjs`, cùng đường đi mà
 * người dùng có repo local vẫn dùng. Hai đường vào mà khác logic nghĩa là một trong hai
 * sẽ ít được chạy hơn, và đường ít chạy hơn là đường hỏng mà không ai biết.
 *
 * VỀ VIỆC PIN VERSION: `npx github:owner/repo` lấy nhánh mặc định — một mục tiêu DI ĐỘNG.
 * Với lần áp ĐẦU TIÊN điều đó chấp nhận được (bạn đọc kết quả ngay, và chưa có gì để hỏng).
 * Với NÂNG CẤP thì không: `upgrade.mjs` đòi `--ref` chính vì lý do đó. Muốn pin cả lần đầu:
 *   npx github:thiengthb/harness#v2.6.0 init
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, ...rest] = process.argv.slice(2);

if (cmd !== 'init') {
  console.log(`
harness — bộ harness cho AI agent trong project thật

  npx github:thiengthb/harness init [thư-mục]     áp lớp harness vào project

Sau đó, TRONG project đó:
  node tooling/setup.mjs --detect     xem nó đọc được gì từ repo của bạn (không ghi)
  node tooling/setup.mjs --apply      phỏng vấn → harness.config.json + ADR 0001
  node tooling/init.mjs               bootstrap (git config, hooks path)
  node tooling/harness-doctor.mjs     lệnh DUY NHẤT bạn cần nhớ về sau
`);
  process.exit(cmd ? 1 : 0);
}

const dest = resolve(rest.find(a => !a.startsWith('--')) ?? '.');
if (!existsSync(dest)) { console.error(`Không tồn tại: ${dest}`); process.exit(1); }

const r = spawnSync(process.execPath, [resolve(HERE, 'tooling', 'apply-to.mjs'), dest, '--apply'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
