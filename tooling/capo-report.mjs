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
import { git, report, readJson, writeJson, repoPath, stateDir } from './lib/harness.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Cùng đường dẫn mà `latestCapoEntry()` đọc — qua `stateDir()` để HARNESS_STATE_DIR chuyển
// được đích trong test. Ghi thẳng `.claude/state/` là cách một test ghi vào sổ THẬT của bạn.
const CAPO_HISTORY = () => join(stateDir(), 'capo-history.json');

/**
 * ═══ BA TRẠNG THÁI CỦA MỘT CỜ, KHÔNG PHẢI HAI ═══════════════════════════════
 *
 * Cờ **vắng mặt** · cờ **có mà thiếu giá trị** · cờ **có giá trị**. Bản trước chỉ có chỗ cho
 * hai, nên cái ở giữa rơi vào cái thứ ba.
 *
 * Đo 2026-08-07 (issue #107), người dùng gõ `--usd` ở cuối dòng:
 *
 *     const USD = arg('--usd', null);      // → undefined, không phải null
 *     if (USD !== null) { ... }            // → undefined !== null là TRUE
 *     ok.push(`CAPO = $${capo.toFixed(2)}`)  // → "OK   CAPO = $NaN"
 *
 * Nhãn **OK**, và nó **ghi thật** một mục `usd: null, capo: null` vào `capo-history.json` —
 * một sổ đo lường mà mọi run-rate về sau neo vào entry gần nhất.
 *
 * `budgetStatus` (v2.39.0) may mắn kiểm `Number.isFinite(usd)` nên hạ nguồn không tin mục đó.
 * Nhưng đó là **phòng thủ tình cờ ở phía đọc**, không phải phía GHI từ chối ghi. Bên ghi rác
 * mà chỉ dựa vào bên đọc lọc là một hợp đồng chỉ đúng cho tới khi có bên đọc thứ hai.
 *
 * `numArg` KHÔNG ĐOÁN: thiếu giá trị, không phải số, hoặc âm ⇒ dừng kèm chỉ dẫn.
 */
const argAt = (n) => { const i = process.argv.indexOf(n); return i > -1 ? { present: true, raw: process.argv[i + 1] } : { present: false }; };

function numArg(name, fallback, { min = 0, hint = '' } = {}) {
  const a = argAt(name);
  if (!a.present) return fallback;
  const v = Number(a.raw);
  // `raw` là cờ kế tiếp (`--json`) cũng tính là THIẾU GIÁ TRỊ — `Number('--json')` ra NaN,
  // nhưng nói "không phải số" cho một cờ thì khó hiểu hơn nói "thiếu giá trị".
  const missing = a.raw === undefined || String(a.raw).startsWith('--');
  if (missing || !Number.isFinite(v) || v < min) {
    console.error(`\n⛔ \`${name}\` ${missing ? 'thiếu giá trị' : `nhận "${a.raw}" — không phải một số hợp lệ`}.`);
    console.error(`  Đây KHÔNG được đoán thành 0 hay bỏ qua: ${name} đi thẳng vào sổ đo lường,`);
    console.error(`  và một con số bịa ở đó thì mọi kỳ sau neo vào nó.`);
    if (hint) console.error(`  ${hint}`);
    process.exit(1);
  }
  return v;
}

const DAYS = numArg('--days', 7, { min: 1, hint: 'Ví dụ: node tooling/capo-report.mjs --days 7 --usd 43' });
// `null` = KHÔNG khai (hợp lệ: báo cáo vẫn chạy, chỉ không tính được CAPO).
const USD = argAt('--usd').present
  ? numArg('--usd', null, { min: 0, hint: 'Lấy con số từ dashboard billing — harness KHÔNG đọc được hoá đơn. Ví dụ: --usd 43' })
  : null;

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
// `Number.isFinite`, KHÔNG phải `!== null`. Tới đây `numArg` đã chặn mọi giá trị hỏng, nên
// điều kiện này là dây an toàn thứ hai — và nó rẻ. Bên GHI phải tự từ chối ghi rác; dựa vào
// bên đọc lọc là một hợp đồng chỉ đúng cho tới khi có bên đọc thứ hai.
if (Number.isFinite(USD)) {
  const capo = accepted ? Number(USD) / accepted : null;
  if (capo === null) fail.push(`Chi tiêu $${USD} nhưng 0 kết quả được chấp nhận.`);
  else {
    ok.push(`CAPO = $${capo.toFixed(2)} / kết quả được chấp nhận`);
    const prev = readJson(CAPO_HISTORY(), { entries: [] });
    const last = prev.entries.at(-1);
    if (last) {
      const delta = capo - last.capo;
      const pct = last.capo ? delta / last.capo * 100 : 0;
      (delta > 0 ? warn : ok).push(`so kỳ trước: ${delta >= 0 ? '+' : ''}$${delta.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%)`);
      if (pct > 20) warn.push('CAPO tăng >20%. Nếu bạn vừa "cải thiện harness": harness đang PHÌNH, không đang tốt lên. Chạy node tooling/harness-size.mjs.');
    }
    prev.entries.push({ at: new Date().toISOString(), days: DAYS, usd: Number(USD), accepted, capo: Number(capo.toFixed(2)), manualFixes });
    writeJson(CAPO_HISTORY(), prev);
  }
} else {
  warn.push('Không có --usd → không tính được CAPO. Lấy con số từ dashboard billing và chạy lại: node tooling/capo-report.mjs --usd 120');
}

report('CAPO', { ok, warn, fail });
console.log(`  Sáu chỉ số cho "harness có đang tốt lên":
    first-try acceptance ↑  ·  can thiệp/feature ↓  ·  sửa tay/tuần ↓
    thời gian tới green ↓   ·  CAPO ↓ hoặc phẳng   ·  KÍCH THƯỚC HARNESS phẳng hoặc ↓
  Chỉ số cuối là chỉ số ngược trực giác — dán nó lên tường.\n`);
