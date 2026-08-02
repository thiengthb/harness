#!/usr/bin/env node
/**
 * CAPO — Cost per Accepted Outcome. Chỉ số kinh tế quan trọng nhất.
 *
 *   node tooling/capo-report.mjs [--days 7] [--usd 120]
 *
 *   CAPO = (tổng chi phí trong kỳ) / (số kết quả ĐƯỢC CHẤP NHẬN trong kỳ)
 *
 * "Được chấp nhận" = merge vào main VÀ không bị revert trong 7 ngày.
 *
 * Vì sao CAPO tốt hơn "token đã dùng": token là INPUT, không phải giá trị.
 * Một run tốn 3× token nhưng ra PR merge được ngay còn RẺ HƠN 3 run rẻ mà bạn
 * phải sửa tay.
 *
 * Đọc kèm: nếu CAPO ĐI LÊN trong khi bạn "cải thiện harness" → harness của bạn
 * đang phình, không đang tốt lên.
 */
import { git, report, readJson, writeJson, repoPath } from './lib/harness.mjs';
import { readFileSync } from 'node:fs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const DAYS = Number(arg('--days', 7));
const USD = arg('--usd', null);   // chi phí kỳ này — lấy từ dashboard billing của bạn

const since = new Date(Date.now() - DAYS * 86400_000).toISOString();
const ok = [], warn = [], fail = [];

// ── Merge / revert ───────────────────────────────────────────────────────────
const log = git(['log', `--since=${since}`, '--pretty=%H|%s|%an']).stdout.split('\n').filter(Boolean);
const commits = log.map(l => { const [sha, subject, author] = l.split('|'); return { sha, subject, author }; });

const reverts = commits.filter(c => /^Revert |revert:/i.test(c.subject));
const merges = commits.filter(c => /^Merge pull request|\(#\d+\)$/.test(c.subject) || /^(feat|fix|refactor|perf)/.test(c.subject));

// Commit do agent viết — cần trailer Co-Authored-By, xem docs/BRANCH-PROTECTION.md
let agentAuthored = 0;
for (const c of commits) {
  const body = git(['show', '-s', '--format=%B', c.sha]).stdout;
  if (/Co-Authored-By:.*(Claude|claude|noreply@anthropic)/.test(body)) agentAuthored++;
}

const accepted = Math.max(0, merges.length - reverts.length);

ok.push(`${DAYS} ngày qua: ${commits.length} commit · ${merges.length} merge · ${reverts.length} revert`);
ok.push(`kết quả ĐƯỢC CHẤP NHẬN: ${accepted}`);
ok.push(`commit có trailer agent: ${agentAuthored}/${commits.length} (${Math.round(agentAuthored / (commits.length || 1) * 100)}%)`);

if (agentAuthored === 0 && commits.length > 3) {
  warn.push('Không commit nào có `Co-Authored-By`. Sáu tháng nữa bạn sẽ muốn biết "code agent có tỉ lệ bug cao hơn không" — không có trailer thì không có phân tích. Xem .gitmessage.');
}

const revertRate = merges.length ? reverts.length / merges.length * 100 : 0;
if (revertRate > 10) warn.push(`Tỉ lệ revert ${revertRate.toFixed(0)}% — cao. Gate đang lọt cái gì?`);

// ── Sửa tay ──────────────────────────────────────────────────────────────────
let manualFixes = 0;
const fixLog = repoPath('.claude', 'telemetry', 'manual-fixes.log');
try {
  manualFixes = readFileSync(fixLog, 'utf8').split('\n').filter(Boolean)
    .filter(l => l.split('|')[0] >= since).length;
} catch {}
ok.push(`sửa tay việc agent làm: ${manualFixes} lần`);
if (manualFixes > accepted && accepted > 0) {
  warn.push('Sửa tay NHIỀU HƠN kết quả được chấp nhận. Agent đang tạo nợ nhanh hơn team trả — xem docs/WIP.md.');
}

// ── CAPO ─────────────────────────────────────────────────────────────────────
if (USD !== null) {
  const capo = accepted ? Number(USD) / accepted : null;
  if (capo === null) fail.push(`Chi tiêu $${USD} nhưng 0 kết quả được chấp nhận.`);
  else {
    ok.push(`CAPO = $${capo.toFixed(2)} / kết quả được chấp nhận`);
    const prev = readJson(repoPath('.claude', 'state', 'capo-history.json'), { entries: [] });
    const last = prev.entries.at(-1);
    if (last) {
      const delta = capo - last.capo;
      const pct = last.capo ? delta / last.capo * 100 : 0;
      (delta > 0 ? warn : ok).push(`so kỳ trước: ${delta >= 0 ? '+' : ''}$${delta.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%)`);
      if (pct > 20) warn.push('CAPO tăng >20%. Nếu bạn vừa "cải thiện harness": harness đang PHÌNH, không đang tốt lên. Chạy node tooling/harness-size.mjs.');
    }
    prev.entries.push({ at: new Date().toISOString(), days: DAYS, usd: Number(USD), accepted, capo: Number(capo.toFixed(2)), manualFixes });
    writeJson(repoPath('.claude', 'state', 'capo-history.json'), prev);
  }
} else {
  warn.push('Không có --usd → không tính được CAPO. Lấy con số từ dashboard billing và chạy lại: node tooling/capo-report.mjs --usd 120');
}

report('CAPO', { ok, warn, fail });
console.log(`  Sáu chỉ số cho "harness có đang tốt lên":
    first-try acceptance ↑  ·  can thiệp/feature ↓  ·  sửa tay/tuần ↓
    thời gian tới green ↓   ·  CAPO ↓ hoặc phẳng   ·  KÍCH THƯỚC HARNESS phẳng hoặc ↓
  Chỉ số cuối là chỉ số ngược trực giác — dán nó lên tường.\n`);
