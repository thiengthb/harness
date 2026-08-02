#!/usr/bin/env node
/**
 * Guard đặt chỗ (advisory reservation) — chạy ở pre-commit.
 *
 * Bậc 2 của Coordination Ladder: khi buộc phải chạm vùng chung mà không muốn
 * serialize toàn bộ. Từ chối commit nếu bạn chạm file người khác đã đặt chỗ.
 *
 * TTL là chi tiết quyết định: nếu agent/người crash, reservation TỰ HẾT HẠN và
 * người khác đi tiếp được. Hard lock từ một agent đã chết thì cần người dọn.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { repoPath, git, readJson, matchGlob, report, config } from './lib/harness.mjs';

const me = process.env.DEV_ID || process.env.USER || process.env.USERNAME || '';
const dir = repoPath('reservations');

if (!existsSync(dir)) process.exit(0);
if (!me) {
  console.error('⚠️  Chưa set DEV_ID — không biết reservation nào là của bạn.');
  console.error('   Set trong .claude/settings.local.json → env.DEV_ID');
}

const staged = git(['diff', '--cached', '--name-only']).stdout.split('\n').filter(Boolean);
if (!staged.length) process.exit(0);

const now = Date.now();
const blocked = [], expired = [], mine = [];

for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const r = readJson(join(dir, f));
  if (!r || !Array.isArray(r.files)) continue;

  const isExpired = new Date(r.expires).getTime() < now;
  if (r.owner === me) { mine.push(`${f}${isExpired ? ' (ĐÃ HẾT HẠN — xoá đi)' : ''}`); continue; }
  if (isExpired) { expired.push(`${f} của ${r.owner} — hết hạn, bỏ qua`); continue; }

  for (const pattern of r.files) {
    for (const s of staged) {
      if (matchGlob(s, pattern)) {
        blocked.push(`${s}  ← ${r.owner} đang giữ (${r.reason || 'không nêu lý do'}, hết hạn ${r.expires})`);
      }
    }
  }
}

if (blocked.length) {
  console.error('\n⛔ BỊ CHẶN — các file này đang được đặt chỗ bởi người khác:\n');
  for (const b of [...new Set(blocked)]) console.error('   ' + b);
  console.error('\nBa lựa chọn (KHÔNG tự quyết, hỏi người):');
  console.error('   a) chọn task khác        b) đợi PR kia merge        c) nhắn chủ reservation');
  console.error(`\nBỏ qua trong trường hợp khẩn: git commit --no-verify (và ghi lý do vào PR).\n`);
  process.exit(1);
}

if (mine.length || expired.length) {
  report('RESERVATIONS', { ok: mine.map(m => 'của bạn: ' + m), warn: expired });
}
process.exit(0);
