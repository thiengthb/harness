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
import { git, report, readJson, writeJson, repoPath, stateDir, config, budgetPlan, rateLimitHitsIn, telemetryDir } from './lib/harness.mjs';
import { readFileSync, existsSync } from 'node:fs';
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
}

// ── GÓI PHẲNG: mẫu số là LẦN CHẠM TRẦN, không phải USD ───────────────────────
//
// Với subscription phẳng, chi tiêu tháng **bằng định nghĩa** đúng bằng trần (xem `budgetStatus`
// §GÓI PHẲNG). Nên `USD / accepted` là *một hằng số chia cho accepted* — nó đo được mỗi việc
// "tháng này ra nhiều kết quả hay ít", và KHÔNG đo gì về hiệu quả của một lần chạy. Chi phí
// BIÊN của một lần chạy là 0.
//
// Cổ chai thật là **rate limit**, và số đó ĐỌC ĐƯỢC — `budget-alarm.log` đã nằm trên đĩa và đã
// có bên phân tích (`rateLimitHitsIn`). Tới trước bản này, `capo-report` đòi người dùng một con
// số mà chính nó ghi trong hint là *"harness KHÔNG đọc được hoá đơn"*, trong khi con số RÀNG
// BUỘC thì nằm sẵn đó không ai đọc. Đòi sai đầu vào thì lời khuyên đúng cũng thành vô dụng.
//
// BA TRẠNG THÁI, không hai: không đọc được sổ ⇒ `?`, KHÔNG phải 0. `rateLimitHitsIn` trả `null`
// cho ca đó, và `null` phải chảy tới cuối chứ không được `|| 0` ở giữa đường.
const PLAN = budgetPlan(config());
if (PLAN === 'flat') {
  // HÌNH DẠNG CHÉP TỪ `budgetSnapshot`, KHÔNG tự nghĩ lại — kể cả chỗ dễ nghĩ khác:
  //
  //   sổ VẮNG      ⇒ 0     (observe.mjs chưa từng ghi lần nào — đó là một số đo thật)
  //   đọc HỎNG     ⇒ null  (`?` — không biết)
  //
  // Bản đầu của tôi gộp cả hai thành `null`. Nghe "an toàn" mà sai: nó biến một repo yên ả
  // thành `?` vĩnh viễn, và quan trọng hơn — nó làm HAI công cụ đọc CÙNG một cái sổ trả lời
  // khác nhau. Đó đúng là #125 (`harness-doctor` nói "12 lần", `rituals` nói "không đo được"),
  // và `budgetSnapshot` ra đời để không ai phải tự lắp lại phép đọc này nữa.
  //
  // Không gọi thẳng `budgetSnapshot()` được vì nó chốt cứng cửa sổ 30 ngày, còn ở đây cửa sổ
  // phải BẰNG cửa sổ đếm merge (`--days`) — trộn hai cửa sổ vào một phân số là một tỉ lệ bịa.
  let hits = null;
  try {
    const f = join(telemetryDir(), 'budget-alarm.log');
    hits = existsSync(f) ? rateLimitHitsIn(readFileSync(f, 'utf8'), Date.now() - DAYS * 86400_000) : 0;
  } catch { hits = null; }

  if (hits === null) {
    warn.push('gói PHẲNG: ĐỌC HỎNG `budget-alarm.log` ⇒ CAPO-TRẦN là `?`, KHÔNG phải 0. '
      + '"Không đọc được sổ" và "chưa lần nào chạm trần" là hai chuyện khác nhau.');
  } else if (!accepted) {
    // WARN, không FAIL — và nhánh USD ngay trên KIA thì FAIL cho cùng tình huống. Khác biệt
    // không phải sự thiếu nhất quán mà là **ai bật nó**: `--usd` là người TỰ khai ("tôi đã tiêu
    // ngần này"), còn nhánh này chạy TỰ ĐỘNG chỉ vì gói cước là phẳng. Một tuần nghỉ phép sẽ
    // làm báo cáo đỏ mà không ai làm gì sai, và một cảnh báo đỏ vô cớ dạy người ta bỏ qua cả
    // khối — `knowledge/lessons/0002-guard-ban-nham.md`.
    warn.push(`gói PHẲNG: ${hits} lần chạm trần trong ${DAYS} ngày nhưng 0 kết quả được chấp nhận `
      + `⇒ chưa có mẫu số, KHÔNG tính được CAPO-TRẦN. Nới cửa sổ (\`--days 30\`) hoặc chờ có merge.`);
  } else {
    const perOutcome = hits / accepted;
    ok.push(`CAPO-TRẦN = ${perOutcome.toFixed(2)} lần chạm trần / kết quả được chấp nhận `
      + `(${hits} lần · ${accepted} kết quả · ${DAYS} ngày)`);
    ok.push('gói PHẲNG: đây MỚI là CAPO của bạn. Tiền không giảm được (chi phí biên = 0); '
      + 'thứ giảm được là số lần chạm trần — cắt context thừa, ít phiên song song hơn. Xem docs/WIP.md.');
  }
  // KHÔNG ghi `capo-history.json` ở nhánh này — CỐ Ý. `budgetStatus` đọc `entries.at(-1)` và
  // mong một mục hình dạng {usd, days}; nhét một mục hình dạng khác vào cùng mảng là đúng lớp
  // lỗi mà header file này ghi lại từ #107 (một sổ đo lường bị neo vào một mục rác). Muốn có
  // xu hướng cho gói phẳng thì cần một sổ RIÊNG, và đó là một quyết định, không phải một
  // tác dụng phụ.
} else if (!Number.isFinite(USD)) {
  warn.push('Không có --usd → không tính được CAPO. Lấy con số từ dashboard billing và chạy lại: node tooling/capo-report.mjs --usd 120');
}

report('CAPO', { ok, warn, fail });
console.log(`  Sáu chỉ số cho "harness có đang tốt lên":
    first-try acceptance ↑  ·  can thiệp/feature ↓  ·  sửa tay/tuần ↓
    thời gian tới green ↓   ·  CAPO ↓ hoặc phẳng   ·  KÍCH THƯỚC HARNESS phẳng hoặc ↓
  Chỉ số cuối là chỉ số ngược trực giác — dán nó lên tường.\n`);
