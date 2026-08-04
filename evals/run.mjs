#!/usr/bin/env node
/**
 * Runner eval — khung tối thiểu.
 *
 *   node evals/run.mjs                 # toàn bộ
 *   node evals/run.mjs --task 0001
 *   node evals/run.mjs --bare          # harness trần (deprecation review)
 *   node evals/run.mjs --dry           # chỉ liệt kê, không chạy
 *
 * Runner này CỐ Ý chưa gọi agent: cách gọi phụ thuộc tool bạn dùng và có tính phí.
 * Nó lo phần khó và ổn định: liệt kê task, tách capability/regression, chạy
 * assertion tất định, so với baseline, và cảnh báo khi bạn đo nhiễu.
 *
 * Nối agent: điền hàm runAgent() ở dưới.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseFrontmatter } from '../tooling/lib/frontmatter.mjs';
import { repoPath, readJson, writeJson, report, git, config, spill } from '../tooling/lib/harness.mjs';

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
function runAssertions(body) {
  const block = body.match(/## Chấm lớp 1[\s\S]*?```bash\n([\s\S]*?)```/);
  if (!block) return { ran: 0, failed: [] };
  const cmds = block[1].split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  const failed = [];
  for (const c of cmds) {
    const r = spawnSync(c, { shell: true, encoding: 'utf8', cwd: repoPath('') });
    if ((r.status ?? 1) !== 0) failed.push(c);
  }
  return { ran: cmds.length, failed };
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
function runAgent(task) {
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
    shell: true, encoding: 'utf8', cwd: repoPath(''),
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
  };
}

const ok = [], warn = [], fail = [];
const results = [];

for (const t of tasks) {
  const label = `${t.id} [${t.kind}/${t.type}] ${t.file.replace(/\.md$/, '')}`;
  if (DRY) { ok.push(label); continue; }

  const agent = runAgent(t);
  const asserts = runAssertions(t.body);

  if (!agent) {
    warn.push(`${label}: evals.command chưa khai — chỉ chạy ${asserts.ran} assertion trên trạng thái HIỆN TẠI`);
  } else {
    if (agent.timedOut) warn.push(`${label}: CHẠM WALL-CLOCK CAP (${t.maxMinutes || '?'} phút) — bị cắt`);
    if (agent.retries >= 3) warn.push(`${label}: ${agent.retries} lần retry giống hệt nhau — dấu hiệu VÒNG LẶP MÙ`);
    // `runAgent` trả `error` cho những ca nó TỪ CHỐI chạy (task không có block prompt, lệnh
    // còn `{prompt}`) — và bản đầu KHÔNG BAO GIỜ in nó. Task hiện ra là đỏ mà không có lý do,
    // nên người đọc đi tìm ở model trong khi lỗi nằm ở cấu hình. Một thông báo lỗi được tạo
    // ra rồi bị bỏ đi thì tệ hơn không tạo ra: chi phí đã trả, giá trị thì không.
    if (agent.error) fail.push(`${label}: ${agent.error}`);
  }

  const passed = asserts.failed.length === 0 && (!agent || agent.ok);
  results.push({ id: t.id, kind: t.kind, type: t.type, passed, failedAssertions: asserts.failed, agent });
  (passed ? ok : fail).push(`${label}${agent ? ` (${agent.minutes}p)` : ''}${asserts.failed.length ? ` → fail: ${asserts.failed[0]}` : ''}`
    + (agent?.transcript ? ` · transcript: ${agent.transcript}` : ''));
}

if (DRY) { report('EVAL (dry)', { ok, warn }); process.exit(0); }

// ── Tách capability vs regression — KHÔNG trộn ───────────────────────────────
const cap = results.filter(r => r.type === 'capability');
const reg = results.filter(r => r.type === 'regression');
const rate = rs => rs.length ? Math.round(rs.filter(r => r.passed).length / rs.length * 100) : null;

console.log('\n=== TỈ LỆ PASS ===');
if (cap.length) console.log(`  CAPABILITY  ${rate(cap)}%  (${cap.filter(r => r.passed).length}/${cap.length})  — mục tiêu: ĐẨY LÊN`);
if (reg.length) console.log(`  REGRESSION  ${rate(reg)}%  (${reg.filter(r => r.passed).length}/${reg.length})  — mục tiêu: BẢO VỆ, phải gần 100%`);

// ── So với baseline ──────────────────────────────────────────────────────────
const basePath = repoPath('.claude', 'state', `eval-baseline${BARE ? '-bare' : ''}.json`);
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
  writeJson(basePath, { at: new Date().toISOString(), env, capability: rate(cap), regression: rate(reg), results });
  ok.push(`đã ghi baseline → ${basePath}`);
}

report(BARE ? 'EVAL (HARNESS TRẦN)' : 'EVAL', { ok, warn: [...hygiene, ...warn], fail });

if (BARE) {
  console.log('  → So điểm này với lần chạy đầy đủ. Chênh lệch NHỎ nghĩa là phần lớn');
  console.log('    harness của bạn là dead weight. Bật lại từng mảnh, đo delta từng mảnh.\n');
}

process.exit(fail.length ? 1 : 0);
