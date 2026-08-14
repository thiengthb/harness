#!/usr/bin/env node
/**
 * Sổ đăng ký các repo ĐANG DÙNG template này — repo nào ở version nào, gửi lên lần cuối bao giờ.
 *
 *   node tooling/knowledge/consumers.mjs              xem sổ + độ lệch version
 *   node tooling/knowledge/consumers.mjs --record     ghi những gì `incoming/` đang có vào sổ
 *
 * VÌ SAO NÓ TỒN TẠI. Template KHÔNG BIẾT consumer của nó tồn tại. Đo 2026-08-05: ba repo
 * (`sakubun`, `sakubun-test`, `warehouse`) đã dùng harness này từ 08-03, HAI trong ba đứng ở
 * **v1.4.0 — sáu version sau lưng**, và chúng chưa từng có `tooling/gates.mjs` (runner ra đời
 * ở 2.0.0). Nghĩa là hai project chạy một harness mà lớp cưỡng chế của nó chưa tồn tại.
 *
 * Cách duy nhất phát hiện ra là liệt kê thư mục cạnh nó bằng tay. Một hệ phân phối mà bên phát hành không
 * biết mình đã phát hành cho ai thì không có cách nào trả lời câu rẻ nhất và quan trọng nhất:
 * *"bản vá hôm nay đã tới ai chưa?"*
 *
 * NGUỒN DỮ LIỆU LÀ `knowledge/incoming/<id>/pack.json` — do `upstream.mjs` ghi ra ở ĐÍCH khi
 * project chủ động gửi lên. Không quét filesystem, không đoán: một repo vào sổ vì **nó đã tự
 * báo danh**, không vì nó tình cờ nằm cạnh. Và `--record` là hành động của NGƯỜI: sổ được
 * commit, nên nó là dữ liệu của team và đi qua review như mọi dữ liệu khác.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { repoPath, readJson, writeJson, report, repoRole, guardFlags } from '../lib/harness.mjs';

guardFlags(process.argv.slice(2), { bool: ['--record'] }, { name: 'knowledge/consumers.mjs' });

const RECORD = process.argv.includes('--record');
const REG = repoPath('knowledge', 'consumers.json');
const INC = repoPath('knowledge', 'incoming');

if (repoRole() !== 'template') {
  console.log('\n○ Sổ này chỉ có nghĩa ở REPO TEMPLATE — nơi phát hành. Bỏ qua.\n');
  process.exit(0);
}

const tplVersion = existsSync(repoPath('harness.version'))
  ? readFileSync(repoPath('harness.version'), 'utf8').trim() : '0.0.0';
const cmp = (a, b) => {
  const A = String(a).split('.').map(Number), B = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0);
  return 0;
};

// ── Thu từ incoming/ ─────────────────────────────────────────────────────────
const reported = [];
if (existsSync(INC)) {
  for (const d of readdirSync(INC)) {
    const pack = readJson(join(INC, d, 'pack.json'));
    if (!pack) continue;
    reported.push({
      id: pack.sourceProject ?? d,
      harnessVersion: pack.sourceHarnessVersion ?? '?',
      lastUpstream: pack.exportedAt ?? null,
      lastCommit: pack.sourceCommit ?? null,
      lessons: (pack.lessons ?? []).length,
      fixlogEntries: pack.fixlogEntries ?? 0,
    });
  }
}

const reg = readJson(REG, { $comment: 'SỔ ĐĂNG KÝ repo dùng template này. Sinh bởi tooling/knowledge/consumers.mjs --record, nguồn là knowledge/incoming/<id>/pack.json (project TỰ báo danh khi chạy upstream). Không quét filesystem, không đoán.', consumers: {} });

if (RECORD) {
  for (const r of reported) {
    const prev = reg.consumers[r.id] ?? {};
    reg.consumers[r.id] = { ...prev, ...r, firstSeen: prev.firstSeen ?? r.lastUpstream };
  }
  writeJson(REG, reg);
}

// ── Báo cáo ──────────────────────────────────────────────────────────────────
const ok = [], warn = [], na = [], unknown = [];
const rows = Object.values(reg.consumers ?? {});

if (!rows.length) {
  na.push('sổ trống — chưa repo nào gửi lên (chạy `node tooling/knowledge/upstream.mjs <template> --apply` ở repo đó).');
  na.push('KHÔNG có nghĩa là "không có consumer": nó có nghĩa là template không biết. Hai thứ đó khác nhau.');
} else {
  for (const c of rows) {
    const behind = c.harnessVersion === '?' ? null : cmp(tplVersion, c.harnessVersion);
    const days = c.lastUpstream ? Math.round((Date.now() - Date.parse(c.lastUpstream)) / 86400000) : null;
    const line = `${String(c.id).padEnd(16)} v${String(c.harnessVersion).padEnd(8)} gửi lên ${days === null ? '?' : days + ' ngày trước'}`
      + (c.fixlogEntries ? ` · ${c.fixlogEntries} fixlog` : '');
    if (behind === null) unknown.push(`${line} — không biết version, pack cũ không ghi \`sourceHarnessVersion\``);
    else if (behind > 0) warn.push(`${line} — SAU template (${tplVersion}). Bản vá từ đó tới nay CHƯA tới repo này.`);
    else ok.push(`${line} — ngang template`);
    if (days !== null && days > 30) warn.push(`${String(c.id)}: ${days} ngày không gửi lên — chiều LÊN của vòng học đang tắt ở repo này`);
  }
}

if (reported.length && !RECORD) {
  const fresh = reported.filter(r => !reg.consumers?.[r.id]);
  if (fresh.length) warn.push(`${fresh.length} repo có pack trong incoming/ mà CHƯA vào sổ: ${fresh.map(r => r.id).join(' · ')} — chạy \`--record\``);
}

report('CONSUMER', { ok, warn, na, unknown });
if (!RECORD && rows.length) console.log('  Cập nhật sổ: node tooling/knowledge/consumers.mjs --record\n');
process.exit(0);
