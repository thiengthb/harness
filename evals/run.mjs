#!/usr/bin/env node
/**
 * Runner eval — khung tối thiểu.
 *
 *   node evals/run.mjs                 # toàn bộ
 *   node evals/run.mjs --task 0001
 *   node evals/run.mjs --bare          # harness trần (deprecation review) — ĐÒI `evals.command`
 *   node evals/run.mjs --dry           # chỉ liệt kê, không chạy
 *
 * Runner này CỐ Ý chưa gọi agent: cách gọi phụ thuộc tool bạn dùng và có tính phí.
 * Nó lo phần khó và ổn định: liệt kê task, tách capability/regression, chạy
 * assertion tất định, so với baseline, và cảnh báo khi bạn đo nhiễu.
 *
 * Nối agent: điền hàm runAgent() ở dưới.
 */
import { readdirSync, readFileSync, existsSync, mkdtempSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseFrontmatter } from '../tooling/lib/frontmatter.mjs';
import { repoPath, readJson, writeJson, report, git, config, spill, infraFailure, budgetExhausted, stateDir } from '../tooling/lib/harness.mjs';

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i > -1 ? argv[i + 1] : d; };

const BARE = has('--bare');
const DRY = has('--dry');
const ONLY = val('--task', '');

/**
 * `EVAL_TASKS_DIR` chuyển thư mục task. CHỈ dùng cho TEST, cùng lý do như `HARNESS_CONFIG`
 * và `HARNESS_STATE_DIR`: `tooling/test-evals.mjs` cần một task TỐI THIỂU để kiểm `runAgent()`
 * (thay placeholder, cắt wall-clock, đếm retry). Chạy trên task THẬT thì suite sẽ kéo theo cả
 * `harness-doctor` của task 0001 — chậm, và nó đo thứ khác.
 */
const DIR = process.env.EVAL_TASKS_DIR || repoPath('evals', 'tasks');
if (!existsSync(DIR)) { console.error('Không có evals/tasks/'); process.exit(1); }

const tasks = readdirSync(DIR)
  .filter(f => f.endsWith('.md') && !f.startsWith('_'))
  .map(f => {
    const { data, body } = parseFrontmatter(readFileSync(join(DIR, f), 'utf8'));
    return { file: f, ...data, body };
  })
  .filter(t => !ONLY || String(t.id) === ONLY);

if (!tasks.length) {
  console.log(`\nChưa có task eval nào trong evals/tasks/.\n
Không có bộ eval thì bạn đang tối ưu MÙ: mọi thay đổi harness là phỏng đoán.
Bắt đầu bằng 4 task "đã từng thất bại" — lấy trực tiếp từ:

  node tooling/fixlog.mjs --top

Đó là loại task giá trị nhất, vì nó bảo vệ chính bài học bạn vừa trả giá để có.
Khuôn: evals/tasks/_TEMPLATE.md\n`);
  process.exit(0);
}

// ── Cảnh báo vệ sinh eval ────────────────────────────────────────────────────
const hygiene = [];
if (!process.env.EVAL_ISOLATED) {
  hygiene.push('EVAL_ISOLATED chưa set — bạn đang chạy CÓ MẠNG. Model có thể suy ra là đang bị eval và tìm ra đáp án.');
}
const dirty = git(['status', '--porcelain']).stdout;
if (dirty) hygiene.push(`repo dirty (${dirty.split('\n').length} file) — kết quả không tái lập được`);

const env = {
  node: process.versions.node,
  platform: process.platform,
  cpus: (await import('node:os')).cpus().length,
  commit: git(['rev-parse', '--short', 'HEAD']).stdout,
  bare: BARE,
};

// ── Chạy assertion tất định trong task ───────────────────────────────────────
//
// BA TRẠNG THÁI, KHÔNG PHẢI HAI. `gates.mjs` có `skip` (chưa khai lệnh ⇒ gate không tồn
// tại), `rituals.mjs` có `?`, `harness-size` có `n/a`. Runner này — công cụ DUY NHẤT trong
// bộ có quyền nói *"KHÔNG promote thay đổi này"* — trước 2.24.0 chỉ có pass/fail, nên mọi
// thứ CHƯA ĐO ĐƯỢC bị đếm là HỎNG.
//
// Đo 2026-08-07 trên harness không hỏng: `REGRESSION 40% (2/5)`, và **không FAIL nào là
// hỏng thật**. Một bộ đo báo 40% khi mọi thứ đúng thì lần sau nó báo 40% vì hỏng thật cũng
// không ai phản ứng.
//
// Hai nguồn của `n/a`:
//   · assertion còn PLACEHOLDER chưa điền (`<…>` hoặc `CHANGEME`) — nó chưa là một lệnh
//   · assertion chỉ đúng SAU KHI agent chạy, mà `evals.command` chưa khai ⇒ không agent nào
//     chạy. Đánh dấu bằng dòng `# requires-agent` ngay TRƯỚC nó.
const PLACEHOLDER = /<[^>]*\s[^>]*>|CHANGEME/;

/**
 * Task khai một CẢNH phải dựng trước khi prompt của nó có nghĩa — mà runner KHÔNG chạy mục đó.
 *
 * `runAssertions()` chỉ trích đúng một khối: `## Chấm lớp 1`. Mọi khối bash khác trong task là
 * văn bản cho người đọc, và với hầu hết mục thì đúng như vậy. Với `## Dựng cảnh` thì không:
 * agent vẫn được gọi, vẫn trả lời, vẫn được chấm — chỉ là nó trả lời về một tình huống KHÔNG
 * TỒN TẠI.
 *
 * Đo 2026-08-07 trên `0004-khong-merge-tay-lockfile` (prompt: *"Có conflict khi merge. Giải
 * quyết giúp tôi rồi commit."*) — transcript thật: *"Không có conflict nào để giải quyết."*
 * Task vẫn vào mẫu số và vẫn được chấm **PASS**, tức nó đẩy tỉ lệ **LÊN**. Cùng lớp với #93
 * nhưng ngược chiều, và chiều này im lặng hơn: không ai đi điều tra một con số đẹp.
 *
 * Nên: có `## Dựng cảnh` ⇒ KHÔNG gọi agent (không tiêu tiền cho một phép đo không xảy ra),
 * KHÔNG chấm, ra khỏi mẫu số, và nói ra lý do. Cho runner tự chạy mục đó là một thay đổi HỢP
 * ĐỒNG riêng, không phải một dòng code: setup CỐ Ý ghi vào repo đang đo, còn
 * `worktreeFingerprint()` dưới đây tồn tại để chặn đúng chuyện ghi vào repo đang đo. Hai thứ
 * đó phải phân biệt được trước đã, và chỗ phân biệt được là một cây CÔ LẬP. Xem #104.
 */
const SETUP_SECTION = /^##\s+Dựng cảnh\s*$/m;

/**
 * Gộp dòng thành LỆNH LOGIC. Bản trước `split('\n')` thẳng, nên một `node -e "…"` nhiều dòng
 * bị băm thành N "lệnh" rời.
 *
 * Hậu quả không chỉ là đếm sai. Đo 2026-08-07 trên Windows: dòng
 * `…filter(([,v])=>v.passes===true…)` chạy MỘT MÌNH trong `cmd.exe`, và `>` trong `=>` là
 * CHUYỂN HƯỚNG OUTPUT ⇒ runner **tạo một file `v.passes` trong repo nó đang đo**, rồi
 * `apply-to --audit` (assertion số 3 của eval 0001) đỏ vì đúng cái file vừa bị tạo.
 * Bộ eval tự làm hỏng assertion kế tiếp của chính nó.
 */
function splitCommands(src) {
  const out = [];
  let cur = '', agentNext = false, pendingAgent = false;
  const flush = () => {
    if (!cur.trim()) return;
    out.push({ cmd: cur.trim(), requiresAgent: pendingAgent });
    cur = ''; pendingAgent = false;
  };
  for (const raw of src.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!cur && /^\s*#/.test(line)) {                 // chú thích chỉ là chú thích khi ở NGOÀI một lệnh
      if (/^\s*#\s*requires-agent\b/.test(line)) agentNext = true;
      continue;
    }
    if (!cur && !line.trim()) continue;
    if (!cur) pendingAgent = agentNext, agentNext = false;
    cur += (cur ? '\n' : '') + line;
    // Nháy còn lẻ ⇒ lệnh chưa kết thúc. Đếm trên chuỗi đã bỏ ký tự thoát.
    const bare = cur.replace(/\\./g, '');
    const balanced = (bare.match(/"/g) || []).length % 2 === 0 && (bare.match(/'/g) || []).length % 2 === 0;
    if (balanced && !/\\$/.test(line)) flush();
  }
  flush();
  return out;
}

/** Khối assertion của một task, đã gộp thành lệnh logic. Rỗng khi task không có khối nào. */
function assertionsOf(body) {
  const block = body.match(/## Chấm lớp 1[\s\S]*?```bash\n([\s\S]*?)```/);
  return block ? splitCommands(block[1]) : [];
}

function runAssertions(body, agentRan, root, skip = null) {
  const cmds = assertionsOf(body);
  const failed = [], na = [];
  let ran = 0;
  for (const { cmd, requiresAgent } of cmds) {
    const one = cmd.split('\n')[0].slice(0, 70);
    if (PLACEHOLDER.test(cmd)) { na.push(`${one} — còn placeholder chưa điền`); continue; }
    if (requiresAgent && !agentRan) { na.push(`${one} — chấm output của agent, mà \`evals.command\` chưa khai`); continue; }
    if (skip?.has(cmd)) {
      na.push(`${one} — ĐỎ SẴN trên cây trần TRƯỚC KHI agent chạy ⇒ nó đo lớp harness, không đo agent`);
      continue;
    }
    ran++;
    const r = spawnSync(cmd, { shell: true, encoding: 'utf8', cwd: root });
    if ((r.status ?? 1) !== 0) failed.push(cmd);
  }
  return { ran, failed, na };
}

/**
 * TIỀN KIỂM của chế độ trần — thứ làm phép trừ có nghĩa thay vì chỉ có số.
 *
 * Gỡ lớp harness ra khỏi một cây thì có assertion **đứt theo**: `0001` chạy
 * `node tooling/test-hooks.mjs`, và suite đó đọc `.claude/`. Nếu để nguyên, task đó ĐỎ ở lần
 * chạy trần và XANH ở lần chạy đầy đủ — rồi phép trừ ghi chênh lệch đó vào cột *"giá trị của
 * harness"*, trong khi agent không liên quan gì. Một số 0 do cấu trúc được thay bằng một số
 * DƯƠNG do cấu trúc thì không khá hơn: nó chỉ sai theo hướng dễ chịu hơn.
 *
 * Nên: chạy các assertion KHÔNG phụ thuộc agent trên cây trần **trước khi agent chạy**. Cái
 * nào đã đỏ khi chưa có gì xảy ra thì nó không nói gì về agent ⇒ `n/a` cho lần chạy này.
 *
 * Tất định, không cần task tự khai, và nó tự đúng khi ai đó đổi `BARE_STRIP`.
 * Chỉ chạy ở chế độ trần: ở chế độ đầy đủ, cây là repo THẬT và tiền kiểm sẽ chạy mọi lệnh
 * thêm một lượt vào đó.
 */
function barePreflight(body, root) {
  const dead = new Set();
  for (const { cmd, requiresAgent } of assertionsOf(body)) {
    if (requiresAgent || PLACEHOLDER.test(cmd)) continue;
    const r = spawnSync(cmd, { shell: true, encoding: 'utf8', cwd: root });
    if ((r.status ?? 1) !== 0) dead.add(cmd);
  }
  return dead;
}

/**
 * Assertion KHÔNG ĐƯỢC ghi vào repo đang đo. Lưới bắt lớp lỗi `v.passes` ở trên — và mọi
 * biến thể của nó, vì nguyên nhân gốc (shell của OS diễn giải chuỗi khác nhau) không thể
 * chặn hết bằng cách sửa từng task.
 *
 * Trả về danh sách đường dẫn mới bẩn, hoặc `null` khi không đọc được git (⇒ `?`, không phải
 * "sạch" — cùng luật ba giá trị với phần trên).
 */
function worktreeFingerprint(root) {
  const r = git(['status', '--porcelain'], { cwd: root });
  return r.status === 0 ? r.stdout : null;
}

// ── HARNESS TRẦN: một cơ chế, không phải một cái nhãn ────────────────────────
//
// Tới 2.42.4, `--bare` **không gỡ gì cả**. Nó đổi tên file baseline, đổi tiêu đề, đổi lời
// nhắn cuối — và `spawnSync` trong `runAgent()` không nhận nó: cùng `cwd`, cùng `env`, cùng
// bộ hook. Hai lần chạy đo **cùng một thứ**, nên `eval − eval --bare` luôn ≈ 0.
//
// Điều đó tệ hơn một cờ hỏng, vì `docs/adr/harness/0002` và `evals/README.md` đặt đúng phép
// trừ đó làm **chỉ số trung tâm**, và lời nhắn cuối của runner dạy người đọc rằng chênh lệch
// nhỏ nghĩa là *"phần lớn harness của bạn là dead weight"*. Một số 0 do cấu trúc, kèm một
// dòng hướng dẫn diễn giải nó thành kết luận sai về chính harness. Xem #91.
//
// GỠ CÁI GÌ — ranh giới là "Claude Code TỰ NẠP thứ này hay không":
//
//   gỡ   .claude/settings.json   đăng ký hook + permission ⇒ không có nó, hook không chạy
//   gỡ   .claude/rules · skills · agents · .mcp.json       ⇒ nạp vào context/tầng discovery
//   gỡ   CLAUDE.md · AGENTS.md                             ⇒ memory file, ~4.6k token (ADR 0002)
//   GIỮ  .claude/hooks/**                                  ⇒ script TRƠ khi không được đăng ký
//   GIỮ  tooling/ · harness.config.json                    ⇒ chỉ chạy khi CÓ NGƯỜI GỌI
//
// Giữ `tooling/` không phải là nhân nhượng: assertion lớp 1 gọi thẳng vào đó, và nếu gỡ nó
// thì lần chạy trần không còn dụng cụ để chấm — ta sẽ đo "harness còn tồn tại không" thay vì
// "agent có hành xử khác không". Cái ta muốn trừ đi là **ảnh hưởng tự động lên agent**.
//
// ĐỔI TÊN, không xoá: cây vẫn đọc được sau khi chạy nếu cần dựng lại hiện trường.
const BARE_STRIP = [
  '.claude/settings.json',
  '.claude/rules',
  '.claude/skills',
  '.claude/agents',
  'CLAUDE.md',
  'AGENTS.md',
  '.mcp.json',
];

/**
 * Clone dùng một lần, đã gỡ remote và gỡ lớp harness. `--depth 1` + `file://` vì clone local
 * mặc định bỏ qua `--depth` (git nói thẳng điều đó) — đo trên repo này: 0.9 giây, 840 KB.
 *
 * Gỡ remote là bắt buộc, không phải vệ sinh: agent chạy trong cây này với quyền ghi, và một
 * `git push` từ đó là push vào repo thật.
 */
/**
 * Xoá cây tạm — và KHÔNG BAO GIỜ ném. Trả `null` khi sạch, hoặc câu lỗi để gọi là một WARN.
 *
 * Đo 2026-08-08 trên Windows, chạy `--bare --task 0001` (task spawn nhiều tiến trình con nhất
 * trong bộ): `rmSync` ném `EPERM` **trên chính thư mục**, sau khi đã xoá hết file bên trong —
 * còn đúng hai thư mục rỗng. Xoá lại vài giây sau thì được ngay. Đây là ca handle-còn-treo
 * kinh điển của Windows: `spawnSync` đã trả về, nhưng handle của tiến trình con (hoặc của phần
 * mềm diệt virus đang quét) chưa đóng. `maxRetries: 3` × 100ms mặc định không đủ.
 *
 * Hai điều rút ra, và điều thứ hai quan trọng hơn:
 *   · thử lại lâu hơn (10 × 200ms) — vá phần lớn ca;
 *   · **dọn dẹp thất bại không được là một exception.** Bản đầu ném sau khi đã in xong báo
 *     cáo: phép đo đã xong, đã đúng, và người dùng nhận một stack trace + exit code sai. Một
 *     lỗi ở bước dọn rác không được phép nuốt kết quả của bước đo.
 */
function rmTree(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    return null;
  } catch (e) {
    return `${e.code || 'lỗi'} — còn sót cây tạm ở ${dir}, xoá tay khi rảnh`;
  }
}

const BARE_PREFIX = 'harness-eval-bare-';

/**
 * Dọn cây trần của những lần chạy TRƯỚC. Cần thiết vì `rmTree` được phép thất bại, và cái
 * được phép thất bại thì sẽ thất bại — mỗi lần một cây 840 KB nằm lại trong tmp.
 *
 * Đo 2026-08-08 trên Windows: sau `--bare --task 0001`, hai thư mục RỖNG (`…/` và `…/repo`)
 * không xoá được, **kể cả từ một tiến trình mới**, trong khi cây của lần chạy trước đó thì xoá
 * được ngay. Không tiến trình nào giữ chúng (đã soi `Win32_Process`) — dấu hiệu của trình quét
 * nền, không phải của một handle bị rò trong code này. Nên đây là ca "sẽ tự hết sau vài phút",
 * và cách đúng là **quét lại ở lần chạy sau**, không phải thử lại lâu hơn ở lần này.
 *
 * Ngưỡng 1 giờ, không phải "mọi cây": hai lần chạy `--bare` song song là chuyện hợp lệ, và một
 * bộ dọn xoá cây của phiên đang chạy thì tệ hơn nhiều so với vài KB rác.
 */
function sweepStaleBareTrees() {
  let n = 0;
  const cutoff = Date.now() - 60 * 60 * 1000;
  let entries = [];
  try { entries = readdirSync(tmpdir(), { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    if (!e.isDirectory() || !e.name.startsWith(BARE_PREFIX)) continue;
    const p = join(tmpdir(), e.name);
    try { if (statSync(p).mtimeMs > cutoff) continue; } catch { continue; }
    if (!rmTree(p)) n++;
  }
  return n;
}

function bareTree() {
  const dir = mkdtempSync(join(tmpdir(), BARE_PREFIX));
  const root = join(dir, 'repo');
  const src = pathToFileURL(repoPath('')).href;
  const cl = spawnSync('git', ['clone', '--quiet', '--depth', '1', '--single-branch', src, root], { encoding: 'utf8' });
  if ((cl.status ?? 1) !== 0) {
    return { dir, error: `git clone thất bại: ${(cl.stderr || cl.error?.message || '').trim().slice(0, 300)}` };
  }
  git(['remote', 'remove', 'origin'], { cwd: root });
  const stripped = [];
  for (const rel of BARE_STRIP) {
    const p = join(root, ...rel.split('/'));
    if (!existsSync(p)) continue;
    renameSync(p, `${p}.bare-disabled`);
    stripped.push(rel);
  }
  return { dir, root, stripped };
}

/**
 * Chạy agent trên một task.
 *
 * Khai lệnh ở `harness.config.json → evals.command`, ví dụ:
 *   "claude -p --max-turns {maxTurns} --permission-mode auto --output-format json"
 *
 * PROMPT ĐI QUA STDIN. Placeholder còn lại: {maxTurns} {maxMinutes} {id} {promptFile}.
 * `{prompt}` đã bị BỎ ở 2.7.8 — xem lý do trong thân hàm.
 *
 * Chưa khai `evals.command` → trả null, runner chỉ chạy assertion trên trạng thái
 * hiện tại. Cố ý: gọi agent TỐN TIỀN, phải là hành động chủ động.
 */
function runAgent(task, root) {
  const tpl = config().evals?.command;
  if (!tpl || !String(tpl).trim()) return null;

  const prompt = (task.body.match(/## Prompt giao cho agent\s*```([\s\S]*?)```/) || [])[1]?.trim();
  if (!prompt) return { ok: false, error: 'task không có block "## Prompt giao cho agent"' };

  const maxTurns = task.maxTurns ?? config().budget?.maxTurnsPerRun ?? 25;
  const maxMinutes = task.maxMinutes ?? config().budget?.maxWallClockMinutes ?? 30;

  // ── PROMPT ĐI QUA STDIN, KHÔNG QUA DÒNG LỆNH ──────────────────────────────
  //
  // Bản đầu nội suy `{prompt}` bằng `JSON.stringify(prompt)`. **JSON escaping không phải
  // shell escaping.** Đo 2026-08-05 bằng agent giả: dấu nháy đôi thì qua đúng, nhưng `\n`
  // tới agent dưới dạng HAI KÝ TỰ literal (`\` và `n`) chứ không phải một dòng mới. Mọi
  // prompt eval thật đều nhiều dòng ⇒ mọi prompt đều bị bóp méo.
  //
  // Và nó bóp méo IM LẶNG: agent vẫn chạy, vẫn trả kết quả, chỉ là nó đọc một prompt khác
  // với prompt trong file task. Điểm eval sai theo hướng không ai truy được — nó đọc y hệt
  // "model tụt hạng". Một lớp inferential control gác bằng một bug computational.
  //
  // stdin không có tầng escaping nào để sai, và nó là đường DUY NHẤT đúng trên cả ba OS
  // (`cmd.exe` xử lý `"` và `%` khác `sh` — xem Parity Contract). `{promptFile}` cho tool
  // không đọc được stdin.
  if (String(tpl).includes('{prompt}')) {
    return { ok: false, error: 'evals.command còn `{prompt}` — placeholder đó đã bị BỎ ở 2.7.8 vì '
      + 'JSON escaping làm prompt nhiều dòng bị bóp méo im lặng. Prompt nay đi qua STDIN: bỏ `{prompt}` '
      + 'khỏi lệnh (ví dụ `claude -p --max-turns {maxTurns}`), hoặc dùng `{promptFile}` nếu tool của bạn không đọc stdin.' };
  }

  const promptFile = String(tpl).includes('{promptFile}')
    ? spill(`eval-prompt-${task.id}`, prompt) : null;

  const cmd = String(tpl)
    .replaceAll('{promptFile}', promptFile ? JSON.stringify(promptFile) : '')
    .replaceAll('{maxTurns}', String(maxTurns))
    .replaceAll('{maxMinutes}', String(maxMinutes))
    .replaceAll('{id}', String(task.id));

  const t0 = Date.now();
  const r = spawnSync(cmd, {
    shell: true, encoding: 'utf8', cwd: root,
    input: prompt,                         // prompt qua stdin: không có tầng escaping nào để sai
    timeout: maxMinutes * 60_000,          // wall-clock cap — guardrail BẮT BUỘC
    maxBuffer: 64 * 1024 * 1024,
  });
  const minutes = (Date.now() - t0) / 60_000;

  // Đếm retry giống hệt nhau từ output — dấu hiệu vòng lặp mù
  const lines = (r.stdout || '').split('\n');
  const seen = new Map();
  for (const l of lines) { const k = l.trim(); if (k.length > 30) seen.set(k, (seen.get(k) || 0) + 1); }
  const retries = Math.max(0, ...[...seen.values()], 0) - 1;

  // GIỮ TRANSCRIPT. Bản đầu bắt toàn bộ output rồi dùng nó DUY NHẤT để đếm retry, xong ném
  // đi. Với một lớp inferential control, đó là ném đi chính bằng chứng: eval đỏ mà không có
  // transcript thì người đọc chỉ có một dòng "task 0003 fail" và không có cách nào biết agent
  // đã làm gì. `features/*.json` đòi `evidence` cho mọi `passes: true` — không lý gì lớp eval,
  // lớp ĐẮT nhất và mờ nhất, lại được miễn.
  const transcript = spill(`eval-${task.id}`, (r.stdout || '') + '\n--- stderr ---\n' + (r.stderr || ''));

  return {
    ok: (r.status ?? 1) === 0,
    timedOut: r.signal === 'SIGTERM',
    minutes: Number(minutes.toFixed(1)),
    retries,
    transcript,
    error: r.error?.message,
    // Agent KHÔNG CHẠY vì hạ tầng ≠ agent làm sai. Xem infraFailure() ở lib/harness.mjs.
    infra: infraFailure(`${r.stdout || ''}\n${r.stderr || ''}`),
    // Agent HẾT NGÂN SÁCH ≠ agent làm sai — và ≠ hạ tầng hỏng (#147). HAI NGUỒN, một trạng
    // thái: trần LƯỢT để lại chữ trong output; trần WALL-CLOCK thì không, `spawnSync` chỉ báo
    // bằng SIGTERM. Bỏ nguồn thứ hai thì một task treo 8 phút vẫn bị chấm FAIL, và ca `hang`
    // của agent giả đã chứng minh đường đó chạy được từ lâu.
    budget: r.signal === 'SIGTERM'
      ? `chạm trần WALL-CLOCK do task khai (${maxMinutes} phút)`
      : budgetExhausted(`${r.stdout || ''}\n${r.stderr || ''}`),
  };
}

const ok = [], warn = [], fail = [];
const results = [];

// ── `--bare` TỪ CHỐI in ra một con số nó không tạo ra được ───────────────────
//
// Ba trạng thái, và `?` ở đây phải là một lối ra CHẶN, không phải một dòng cảnh báo: người gõ
// `--bare` đang xin đúng MỘT con số, nên in cho họ một con số sai còn tệ hơn không in gì.
// Hai điều kiện dưới đây là hai cách khác nhau để hai lần chạy giống hệt nhau.
let bare = null;
if (BARE && !DRY) {
  if (!String(config().evals?.command || '').trim()) {
    console.error('\n`--bare` TỪ CHỐI chạy: `evals.command` rỗng.\n\n'
      + 'Không agent nào chạy ⇒ cả hai lần đo chỉ chạy assertion tất định trên cùng một trạng thái\n'
      + 'cây, nên lần trần KHÔNG THỂ khác lần đầy đủ. Phép trừ sẽ ra 0 do CẤU TRÚC, và một số 0\n'
      + 'do cấu trúc đọc y hệt một phát hiện.\n\n'
      + 'Khai `evals.command` trong harness.config.json rồi chạy lại.\n');
    process.exit(1);
  }
  bare = bareTree();
  if (bare.error) {
    console.error(`\n\`--bare\` TỪ CHỐI chạy: không dựng được cây trần.\n  ${bare.error}\n`);
    rmTree(bare.dir);
    process.exit(1);
  }
  if (!bare.stripped.length) {
    console.error('\n`--bare` TỪ CHỐI chạy: KHÔNG gỡ được gì.\n\n'
      + `Không đường dẫn nào trong BARE_STRIP tồn tại ở cây này (${BARE_STRIP.join(' · ')}).\n`
      + 'Cây trần y hệt cây đầy đủ ⇒ phép trừ vô nghĩa. Đây đúng là chế độ hỏng của #91.\n');
    rmTree(bare.dir);
    process.exit(1);
  }
  console.log(`\nCÂY TRẦN: ${bare.root}\n  đã gỡ: ${bare.stripped.join(' · ')}`);
  const swept = sweepStaleBareTrees();
  if (swept) console.log(`  dọn thêm ${swept} cây trần cũ (>1 giờ) còn sót từ lần chạy trước`);
}
const ROOT = bare?.root || repoPath('');

for (const t of tasks) {
  const label = `${t.id} [${t.kind}/${t.type}] ${t.file.replace(/\.md$/, '')}`;
  if (DRY) { ok.push(label); continue; }

  // Cảnh chưa dựng ⇒ dừng TRƯỚC `runAgent`. Thứ tự này là phần chính của bản vá: gọi agent
  // rồi mới nói "không đo được" thì đã trả tiền cho một lượt chạy không nói gì.
  if (SETUP_SECTION.test(t.body)) {
    results.push({ id: t.id, kind: t.kind, type: t.type, measured: false, passed: false, failedAssertions: [], na: [], agent: null });
    warn.push(`${label}: KHÔNG ĐO ĐƯỢC — task khai \`## Dựng cảnh\` mà runner KHÔNG chạy mục đó. `
      + 'Agent sẽ nhận một prompt về tình huống CHƯA ĐƯỢC DỰNG, và câu trả lời của nó không nói gì về câu hỏi task đặt ra. '
      + 'Không gọi agent, không chấm, ra khỏi mẫu số. Dựng cảnh bằng tay rồi chạy lại — hoặc xem #104.');
    continue;
  }

  // Tiền kiểm CHẠY TRƯỚC agent — đó là toàn bộ giá trị của nó: nó chụp lại "cây này chấm được
  // gì khi chưa có gì xảy ra". Chạy sau thì không phân biệt được với hậu quả của agent.
  const dead = bare ? barePreflight(t.body, ROOT) : null;
  const agent = runAgent(t, ROOT);
  const before = worktreeFingerprint(ROOT);
  const asserts = runAssertions(t.body, Boolean(agent), ROOT, dead);
  const after = worktreeFingerprint(ROOT);

  // Assertion vừa ghi vào repo ⇒ FAIL, và nêu tên. Đây là hỏng THẬT, không phải `n/a`:
  // một bộ đo làm bẩn đối tượng nó đo thì mọi số sau đó đều đáng ngờ, kể cả số của task khác.
  if (before !== null && after !== null && before !== after) {
    const now = new Set(after.split('\n').filter(Boolean));
    for (const l of before.split('\n').filter(Boolean)) now.delete(l);
    fail.push(`${label}: assertion GHI VÀO REPO đang đo — ${[...now].map(s => s.slice(3)).join(' · ') || '(cây đổi)'}`
      + '. Gần như luôn là shell của OS diễn giải một ký tự trong assertion (`=>` thành chuyển hướng trên cmd.exe).');
    asserts.failed.push('(ghi vào repo)');
  }

  if (!agent) {
    warn.push(`${label}: evals.command chưa khai — chỉ chạy ${asserts.ran} assertion trên trạng thái HIỆN TẠI`
      + (asserts.na.length ? `, ${asserts.na.length} n/a` : ''));
  } else {
    // `timedOut` KHÔNG còn có dòng riêng ở đây: từ #147 nó chảy vào `agent.budget`, và dòng
    // "KHÔNG ĐO ĐƯỢC" phía dưới nói đủ hơn (nêu trần, nêu rằng chạy lại không giúp gì). Giữ cả
    // hai là in hai dòng cho một sự kiện, và dòng ngắn hơn sẽ được đọc trước.
    if (agent.retries >= 3) warn.push(`${label}: ${agent.retries} lần retry giống hệt nhau — dấu hiệu VÒNG LẶP MÙ`);
    // `runAgent` trả `error` cho những ca nó TỪ CHỐI chạy (task không có block prompt, lệnh
    // còn `{prompt}`) — và bản đầu KHÔNG BAO GIỜ in nó. Task hiện ra là đỏ mà không có lý do,
    // nên người đọc đi tìm ở model trong khi lỗi nằm ở cấu hình. Một thông báo lỗi được tạo
    // ra rồi bị bỏ đi thì tệ hơn không tạo ra: chi phí đã trả, giá trị thì không.
    if (agent.error) fail.push(`${label}: ${agent.error}`);
  }

  // `n/a` THẬT: không assertion nào chạy được, và cũng không có agent để chấm. Task này
  // KHÔNG pass và KHÔNG fail — nó chưa được đo, và nó phải ra khỏi MẪU SỐ của tỉ lệ.
  // Đếm nó là fail thì tỉ lệ nói dối theo chiều hoảng; đếm là pass thì nói dối theo chiều
  // dễ chịu. Cả hai đều tệ hơn việc nói "chưa đo".
  // Agent hỏng vì HẠ TẦNG ⇒ task này CHƯA ĐƯỢC ĐO, dù `runAgent` có trả về một object và dù
  // assertion có chạy. Assertion khi đó chấm một cây KHÔNG CÓ GÌ XẢY RA — nó nói về trạng thái
  // trước đó, không nói gì về agent. Đo 2026-08-07: bỏ vế này ⇒ hết quota in ra
  // `REGRESSION 25% (1/4)`, tức một phép đo KHÔNG XẢY RA được ghi thành THẤT BẠI. Xem #93.
  //
  // MỘT AGENT CHẠY XONG KHÔNG PHẢI MỘT PHÉP ĐO. Runner này chỉ chấm **lớp 1** — assertion tất
  // định. `## Chấm lớp 2` là việc của người/LLM và runner không đọc nó. Nên khi không assertion
  // nào CHẠY ĐƯỢC thì không có gì để chấm, kể cả khi agent đã chạy, exit 0 và tốn 8 phút.
  // Bản trước viết `(asserts.ran > 0 || Boolean(agent))`: vế thứ hai đưa một task 0 assertion
  // vào mẫu số rồi chấm nó theo exit code của agent — mà exit code của `claude -p` chỉ nói
  // "phiên kết thúc bình thường", không nói gì về việc agent làm ĐÚNG. Đo 2026-08-08: `0004`
  // góp một điểm PASS vào `REGRESSION 100% (4/4)` với 0 assertion chạy được. Xem #104.
  // `!agent?.budget` đứng cạnh `!agent?.infra` vì cùng một lý do, chỉ khác nguyên nhân: cả hai
  // là ca agent CHƯA KỊP hành động, nên assertion đang chấm một cây chưa có gì xảy ra. Đo
  // 2026-08-10 (#147): bỏ vế này ⇒ ba task hết lượt in ra `REGRESSION 0% (0/3)`, và một trong
  // ba thực ra làm việc ĐÚNG tới lúc cạn — một phép đo KHÔNG XẢY RA được ghi thành THẤT BẠI,
  // đúng chữ mà chú thích của `infra` ngay trên đã viết cho ca #93.
  const measured = asserts.ran > 0 && !agent?.infra && !agent?.budget;
  const passed = measured && asserts.failed.length === 0 && (!agent || agent.ok);
  results.push({ id: t.id, kind: t.kind, type: t.type, measured, passed, failedAssertions: asserts.failed, na: asserts.na, agent });

  for (const n of asserts.na) warn.push(`${label}: n/a — ${n}`);

  if (!measured) {
    // BỐN nguyên nhân khác nhau, bốn câu khác nhau. Gộp chúng là đúng phép gộp mà cả file này
    // tồn tại để chống: "chưa nối agent" là cấu hình, "agent không chạy được" là hạ tầng
    // (thường TẠM THỜI — chạy lại là có số), "hết ngân sách" là TRẦN DO TASK KHAI (chạy lại
    // KHÔNG giúp gì — cạn lại ở đúng chỗ đó), còn "agent chạy rồi mà không có gì chấm được" là
    // một lỗ trong chính TASK. Bốn việc phải làm khác nhau ⇒ bốn câu.
    //
    // THỨ TỰ CÓ NGHĨA: `infra` trước `budget`. Một agent chạm quota GIỮA CHỪNG có thể in cả
    // hai chữ ký; nguyên nhân gốc là hạ tầng, và lời khuyên "chạy lại" khi đó mới đúng.
    warn.push(agent?.infra
      ? `${label}: KHÔNG ĐO ĐƯỢC — agent hỏng vì HẠ TẦNG (${agent.infra}), trả về sau ${agent.minutes}p. `
        + `Đây KHÔNG phải "agent làm sai": nó chưa từng chạy. Task ra khỏi mẫu số. Chạy lại khi hạ tầng ổn`
        + (agent.transcript ? ` · transcript: ${agent.transcript}` : '')
      : agent?.budget
      ? `${label}: KHÔNG ĐO ĐƯỢC — agent CẠN NGÂN SÁCH (${agent.budget}) sau ${agent.minutes}p. `
        + `Đây KHÔNG phải "agent làm sai": nó chưa kịp trả lời, nên assertion đang chấm một cây chưa có gì xảy ra. `
        + `Task ra khỏi mẫu số. CHẠY LẠI KHÔNG GIÚP GÌ — trần do task khai, lần sau cạn ở đúng chỗ này. `
        + `Đọc transcript để phân biệt hai ca: agent lạc đường, hay ngân sách hiệu chỉnh cho một đời CLI khác `
        + `(một lượt \`claude -p\` là một vòng tool-call, nên task đòi đọc file hết lượt trước khi kịp trả lời)`
        + (agent.transcript ? ` · transcript: ${agent.transcript}` : '')
      : agent
      ? `${label}: KHÔNG ĐO ĐƯỢC — agent ĐÃ CHẠY (${agent.minutes}p) nhưng KHÔNG assertion nào chạy được `
        + `(${asserts.na.length} n/a). Runner chỉ chấm LỚP 1: một lượt chạy kết thúc bình thường không phải `
        + `một phép đo. Điền assertion tất định cho task này, hoặc chấp nhận nó ở ngoài mẫu số`
        + (agent.transcript ? ` · transcript: ${agent.transcript}` : '')
      : `${label}: KHÔNG ĐO ĐƯỢC — ${asserts.na.length} assertion đều n/a và chưa khai \`evals.command\`. Không tính vào tỉ lệ.`);
  } else {
    (passed ? ok : fail).push(`${label}${agent ? ` (${agent.minutes}p)` : ''}${asserts.failed.length ? ` → fail: ${asserts.failed[0]}` : ''}`
      + (agent?.transcript ? ` · transcript: ${agent.transcript}` : ''));
  }
}

if (DRY) { report('EVAL (dry)', { ok, warn }); process.exit(0); }

// ── Tách capability vs regression — KHÔNG trộn ───────────────────────────────
// MẪU SỐ chỉ gồm task ĐO ĐƯỢC. Một task `n/a` không phải 0 điểm — nó không có điểm.
const cap = results.filter(r => r.type === 'capability' && r.measured);
const reg = results.filter(r => r.type === 'regression' && r.measured);
const naCount = results.filter(r => !r.measured).length;
const rate = rs => rs.length ? Math.round(rs.filter(r => r.passed).length / rs.length * 100) : null;

console.log('\n=== TỈ LỆ PASS ===');
if (cap.length) console.log(`  CAPABILITY  ${rate(cap)}%  (${cap.filter(r => r.passed).length}/${cap.length})  — mục tiêu: ĐẨY LÊN`);
if (reg.length) console.log(`  REGRESSION  ${rate(reg)}%  (${reg.filter(r => r.passed).length}/${reg.length})  — mục tiêu: BẢO VỆ, phải gần 100%`);
// In ra, KHÔNG giấu: một mẫu số co lại mà không nói là cách một tỉ lệ đẹp lên mà không ai
// làm gì. Đây cũng là con số cần nhìn khi so hai lần chạy — 100% trên 1 task ≠ 100% trên 5.
if (naCount) console.log(`  n/a         ${naCount} task KHÔNG ĐO ĐƯỢC — ngoài mẫu số, KHÔNG phải "pass"`);

// ── So với baseline ──────────────────────────────────────────────────────────
// `stateDir()` chứ không `repoPath('.claude','state')` cứng: baseline LÀ trạng thái cục bộ, và
// `HARNESS_STATE_DIR` là đường duy nhất để suite kiểm phép trừ mà không ghi đè baseline THẬT
// của người đang chạy nó — cùng lý do `test-hooks.mjs` phải chuyển state đi chỗ khác.
const basePath = join(stateDir(), `eval-baseline${BARE ? '-bare' : ''}.json`);
const prev = readJson(basePath);
if (prev) {
  const dCap = rate(cap) !== null && prev.capability !== null ? rate(cap) - prev.capability : null;
  const dReg = rate(reg) !== null && prev.regression !== null ? rate(reg) - prev.regression : null;
  if (dReg !== null && dReg < 0) fail.push(`REGRESSION TỤT ${dReg}pp so với baseline (${prev.at.slice(0, 10)}) — KHÔNG promote thay đổi này`);
  else if (dReg !== null) ok.push(`regression ${dReg >= 0 ? '+' : ''}${dReg}pp`);
  if (dCap !== null) ok.push(`capability ${dCap >= 0 ? '+' : ''}${dCap}pp`);
  if (JSON.stringify(prev.env?.platform) !== JSON.stringify(env.platform) || prev.env?.cpus !== env.cpus) {
    warn.push(`Hạ tầng khác baseline (${prev.env?.platform}/${prev.env?.cpus}c vs ${env.platform}/${env.cpus}c) — cấu hình tài nguyên một mình có thể gây swing 6+pp. Bạn đang đo nhiễu.`);
  }
}

if (has('--baseline')) {
  writeJson(basePath, { at: new Date().toISOString(), env, capability: rate(cap), regression: rate(reg), results, stripped: bare?.stripped ?? null });
  ok.push(`đã ghi baseline → ${basePath}`);
}

// ── PHÉP TRỪ: giá trị đo được của harness ────────────────────────────────────
//
// Runner tự làm phép trừ, thay vì để người đọc trừ hai con số bằng mắt. Lý do không phải tiện:
// hai con số đó có **hai mẫu số khác nhau**, và trừ chúng bằng mắt là một phép tính sai không
// có gì báo. Ví dụ thật: `0001` chấm được ở lần đầy đủ nhưng `n/a` ở lần trần (assertion của
// nó đọc `.claude/`) ⇒ `100% (5/5)` với `100% (4/4)` trông như "chênh 0" trong khi hai vế nói
// về hai tập task.
//
// Nên chỉ trừ trên **giao** của hai tập ĐO ĐƯỢC, và in luôn số task bị loại. Giao rỗng ⇒ `?`.
const otherPath = join(stateDir(), `eval-baseline${BARE ? '' : '-bare'}.json`);
const other = readJson(otherPath);
if (other) {
  const mine = new Map(results.filter(r => r.measured).map(r => [String(r.id), r.passed]));
  const theirs = new Map((other.results || []).filter(r => r.measured).map(r => [String(r.id), r.passed]));
  const common = [...mine.keys()].filter(id => theirs.has(id));
  const pct = (m) => Math.round(common.filter(id => m.get(id)).length / common.length * 100);

  console.log('\n=== GIÁ TRỊ ĐO ĐƯỢC CỦA HARNESS ===');
  if (!common.length) {
    console.log('  ?  không task nào ĐO ĐƯỢC ở CẢ HAI lần chạy — chưa trừ được gì.');
    console.log(`     lần này: ${mine.size} task · baseline ${BARE ? 'đầy đủ' : 'trần'}: ${theirs.size} task`);
  } else {
    const full = BARE ? pct(theirs) : pct(mine);
    const nude = BARE ? pct(mine) : pct(theirs);
    const dropped = results.filter(r => r.measured).length - common.length;
    console.log(`  đầy đủ ${full}%  −  trần ${nude}%  =  ${full - nude >= 0 ? '+' : ''}${full - nude}pp`
      + `   trên ${common.length} task so được${dropped ? ` (${dropped} task loại: không đo được ở lần kia)` : ''}`);
    if (other.env?.commit && other.env.commit !== env.commit) {
      warn.push(`Phép trừ đang so hai COMMIT KHÁC NHAU (${other.env.commit} vs ${env.commit}) — chênh lệch gồm cả thay đổi code giữa hai commit, không chỉ lớp harness.`);
    }
    if (full - nude === 0) {
      console.log('     Chênh lệch 0 ở đây là một PHÁT HIỆN, không phải hiện vật của dụng cụ:');
      console.log('     cây trần thật sự đã bị gỡ lớp harness. Bật lại từng mảnh, đo delta từng mảnh.');
    }
  }
} else if (BARE) {
  console.log('\n=== GIÁ TRỊ ĐO ĐƯỢC CỦA HARNESS ===');
  console.log('  ?  chưa có baseline đầy đủ để trừ. Chạy `node evals/run.mjs --baseline` trước.');
}

// Dọn TRƯỚC khi in: nếu dọn hỏng, nó là một WARN trong bảng — không phải một stack trace
// đổ ra sau một báo cáo đã đúng.
if (bare) { const e = rmTree(bare.dir); if (e) warn.push(`dọn cây trần: ${e}`); }

report(BARE ? 'EVAL (HARNESS TRẦN)' : 'EVAL', { ok, warn: [...hygiene, ...warn], fail });

process.exit(fail.length ? 1 : 0);
