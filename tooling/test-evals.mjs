#!/usr/bin/env node
/**
 * Kiểm `runAgent()` của `evals/run.mjs` — phần chỉ chạy khi có người điền `evals.command`.
 *
 *   node tooling/test-evals.mjs
 *
 * VÌ SAO SUITE NÀY TỒN TẠI. Đo 2026-08-05: `evals.command` **rỗng ở cả bốn repo** (template
 * + ba repo tiêu thụ). Nghĩa là ~40 dòng lo thay placeholder, cắt wall-clock và đếm retry là
 * code **chưa bao giờ chạy ở đâu** — và nó nằm ở lớp inferential control, lớp mà `AGENTS.md`
 * dặn phải ưu tiên computational control TRƯỚC.
 *
 * Chế độ hỏng của nó tệ theo một cách riêng: nếu `{prompt}` thay sai thì MỌI eval fail cùng
 * lúc, và triệu chứng đọc y hệt *"model vừa tụt hạng"*. Người ta đi tìm ở model, không ở
 * runner. Một bug computational được che bởi một lớp inferential.
 *
 * Không kiểm bằng model thật: tốn tiền, cần mạng, không tất định — ba lý do làm nó không bao
 * giờ vào CI. `evals/fixtures/fake-agent.mjs` thì tất định và miễn phí, và nó kiểm đúng phần
 * thuộc về HARNESS.
 *
 * HỘP ĐEN, không import: gọi `evals/run.mjs` qua CLI với `HARNESS_CONFIG` + `EVAL_TASKS_DIR`.
 * Như vậy suite đi qua cả đường đọc config thật, không chỉ một hàm bị bóc khỏi ngữ cảnh.
 */
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { repoPath, report } from './lib/harness.mjs';

const ok = [], fail = [], warn = [];
const WORK = join(tmpdir(), `harness-eval-test-${process.pid}`);
const TASKS = join(WORK, 'tasks');
rmSync(WORK, { recursive: true, force: true });
mkdirSync(TASKS, { recursive: true });

// Prompt cố ý chứa dấu nháy đôi, nháy đơn, xuống dòng và `%` — bốn thứ hay chết khi một
// lệnh đi qua shell. `%` là ca RIÊNG của `cmd.exe` trên Windows (nó nội suy biến), nên case
// này là lý do suite phải chạy trên cả ba OS chứ không chỉ trên máy DRI.
const PROMPT = 'Sửa "file này" rồi báo lại\nDòng hai: 100% xong, đừng \'đoán\'';

const FAKE = repoPath('evals', 'fixtures', 'fake-agent.mjs').split('\\').join('/');

writeFileSync(join(TASKS, '9001-fixture.md'), `---
id: "9001"
kind: representative
type: regression
maxTurns: 7
maxMinutes: 0.05
origin: "Fixture của tooling/test-evals.mjs — KHÔNG phải task eval thật"
---

## Prompt giao cho agent

\`\`\`
${PROMPT}
\`\`\`

## Chấm lớp 1 — tất định

\`\`\`bash
node -e "process.exit(0)"
\`\`\`
`, 'utf8');

/** Config tối thiểu: chỉ `evals.command` là thứ suite này quan tâm. */
function writeConfig(command) {
  const p = join(WORK, `config-${Math.abs(hash(command))}.json`);
  writeFileSync(p, JSON.stringify({
    $comment: 'FIXTURE của tooling/test-evals.mjs — không phải config của project nào',
    project: { id: 'fixture-eval', dri: '@fixture', integrationBranch: 'origin/main', issuePrefixes: ['FIX'], platforms: ['core'] },
    commands: {}, paths: {}, limits: {}, gates: { stop: [], subagent: [], preMerge: [] },
    budget: { maxTurnsPerRun: 25, maxWallClockMinutes: 30 },
    knowledge: {}, evals: { command },
  }, null, 2) + '\n', 'utf8');
  return p;
}
const hash = (s) => [...String(s)].reduce((a, c) => (a * 33 + c.charCodeAt(0)) | 0, 5381);

/** Đọc những gì agent nhận được — từ TRANSCRIPT, vì runner không (và không nên) in output agent ra thẳng. */
function received(out) {
  const m = out.match(/transcript: (\S+)/);
  if (!m) return null;
  let txt; try { txt = readFileSync(m[1], 'utf8'); } catch { return null; }
  const a = txt.match(/FAKE_AGENT_ARGV=(\[.*\])/);
  const p = txt.match(/FAKE_AGENT_STDIN=("(?:[^"\\]|\\.)*")/);
  try {
    return { argv: a ? JSON.parse(a[1]) : null, stdin: p ? JSON.parse(p[1]) : null };
  } catch { return null; }
}

// `taskId` mặc định `9001` — ca ①–⑦ đều dùng task đó. Tham số hoá vì ca ⑧⑨⑩ cần task
// RIÊNG: bản trước cứng `--task 9001`, nên một fixture mới ghi vào `TASKS` bị lọc mất và
// ca của nó xanh VÌ KHÔNG CÓ GÌ CHẠY. Đã gặp thật khi viết ⑩ (2026-08-07).
function runEval(command, mode, taskId = '9001') {
  const r = spawnSync(process.execPath, [repoPath('evals', 'run.mjs'), '--task', taskId], {
    cwd: repoPath(''), encoding: 'utf8',
    env: {
      ...process.env,
      HARNESS_CONFIG: writeConfig(command),
      EVAL_TASKS_DIR: TASKS,
      EVAL_ISOLATED: '1',
      ...(mode ? { FAKE_AGENT_MODE: mode } : {}),
    },
  });
  return { out: (r.stdout || '') + (r.stderr || ''), status: r.status ?? 1 };
}

// KHÔNG có `{prompt}`: từ 2.7.8 prompt đi qua stdin. Lệnh có `{prompt}` bị runner TỪ CHỐI
// (case ⑦), vì bóp méo im lặng tệ hơn một lỗi nói ra.
const CMD = `node ${JSON.stringify(FAKE)} --turns {maxTurns} --minutes {maxMinutes} --id {id}`;

// ── ① Placeholder được thay ĐÚNG, kể cả prompt nhiều dòng có dấu nháy ────────
{
  const { out } = runEval(CMD, 'ok');
  const r = received(out);
  if (!r?.argv) fail.push('① không đọc được transcript — `evals.command` không được gọi, hoặc transcript không được giữ');
  else {
    {
      const { argv } = r;
      // Prompt phải tới NGUYÊN VĂN, byte-đúng-byte. Đây là case đã bắt được bug thật: bản
      // trước nội suy {prompt} bằng JSON.stringify và `\n` tới agent thành HAI ký tự literal.
      if (r.stdin?.trim() !== PROMPT) fail.push(`① prompt qua stdin SAI. Nhận: ${JSON.stringify(r.stdin)?.slice(0, 140)}`);
      else ok.push('① prompt qua stdin NGUYÊN VĂN — xuống dòng thật, nháy đôi, nháy đơn, dấu %');
      const turns = argv[argv.indexOf('--turns') + 1];
      if (turns !== '7') fail.push(`① {maxTurns} phải lấy từ TASK (7), nhận "${turns}" — task thắng budget mặc định`);
      else ok.push('① {maxTurns} lấy từ task, không lấy mặc định của budget');
      if (argv[argv.indexOf('--id') + 1] !== '9001') fail.push('① {id} thay sai');
      else ok.push('① {id} và {maxMinutes} được thay');
    }
  }
}

// ── ② Agent exit != 0 ⇒ task FAIL, không phải "xanh vì assertion xanh" ───────
{
  const { out, status } = runEval(CMD, 'fail');
  if (status === 0) fail.push('② agent exit 3 mà runner vẫn exit 0 — một eval FAIL đọc thành PASS');
  else if (!/9001/.test(out)) fail.push('② runner đỏ nhưng không nêu task nào');
  else ok.push('② agent exit != 0 ⇒ task FAIL (assertion xanh KHÔNG cứu được)');
}

// ── ③ Vòng lặp mù: cùng một dòng lặp lại nhiều lần ──────────────────────────
{
  const { out } = runEval(CMD, 'loop');
  if (!/VÒNG LẶP MÙ/.test(out)) fail.push('③ 5 dòng giống hệt nhau mà không có cảnh báo vòng lặp mù — bộ đếm retry không hoạt động');
  else ok.push('③ 5 dòng giống hệt ⇒ cảnh báo VÒNG LẶP MÙ');
}

// ── ④ Wall-clock cap: guardrail ngân sách, không phải lời khuyên ─────────────
{
  const { out } = runEval(CMD, 'hang');
  if (!/WALL-CLOCK CAP/.test(out)) fail.push('④ agent treo mà KHÔNG bị cắt ở maxMinutes=0.05 (3 giây) — cap ngân sách không tồn tại');
  else ok.push('④ agent treo ⇒ bị cắt ở wall-clock cap và NÓI RA');
}

// ── ⑤ `evals.command` rỗng ⇒ nói ra là chưa gọi agent, KHÔNG im lặng ─────────
{
  const { out } = runEval('', null);
  if (!/chưa khai/.test(out)) fail.push('⑤ evals.command rỗng mà runner không nói gì — người đọc tưởng agent đã chạy');
  else ok.push('⑤ evals.command rỗng ⇒ WARN nói rõ chỉ chạy assertion, không gọi agent');
}

// ── ⑥ MUTANT: bỏ phần thay {prompt} ⇒ suite phải ĐỎ ─────────────────────────
// Hợp đồng ① chỉ có giá trị nếu nó bắt được chế độ hỏng thật. Chế độ hỏng thật ở đây là
// "placeholder không được thay" — và nó phải làm ① đỏ, không phải làm nó `n/a`.
{
  const { out } = runEval(`node ${JSON.stringify(FAKE)} --turns {maxTurns-sai} --minutes {maxMinutes} --id {id}`, 'ok');
  const argv = received(out)?.argv ?? [];
  const turns = argv[argv.indexOf('--turns') + 1];
  if (turns === '7') fail.push('⑥ MUTANT SỐNG SÓT: placeholder viết sai tên mà giá trị vẫn tới đúng — hợp đồng ① không kiểm gì');
  else ok.push('⑥ MUTANT bị giết: placeholder sai tên ⇒ giá trị KHÔNG được thay (hợp đồng ① có hiệu lực)');
}

// ── ⑦ Lệnh còn `{prompt}` ⇒ TỪ CHỐI, không bóp méo im lặng ──────────────────
{
  const { out, status } = runEval(`node ${JSON.stringify(FAKE)} --prompt {prompt} --id {id}`, 'ok');
  if (status === 0) fail.push('⑦ lệnh còn `{prompt}` mà runner vẫn chạy — prompt nhiều dòng sẽ bị bóp méo im lặng');
  else if (!/\{prompt\}/.test(out)) fail.push('⑦ runner từ chối nhưng không nói lý do là `{prompt}`');
  else ok.push('⑦ lệnh còn `{prompt}` ⇒ TỪ CHỐI kèm cách sửa (bóp méo im lặng tệ hơn lỗi nói ra)');
}

// ── ⑧⑨⑩ BA TRẠNG THÁI, và assertion KHÔNG được ghi vào repo ─────────────────
//
// Trước 2.24.0 runner chỉ có pass/fail, nên "chưa đo được" bị đếm là HỎNG: đo 2026-08-07
// trên harness không hỏng ra `REGRESSION 40% (2/5)` với 0 hỏng thật. Ba ca dưới khoá lại
// ba nửa của bản vá — mỗi ca một task fixture riêng, chạy với `evals.command` RỖNG (đó là
// trạng thái thật của mọi repo hiện có).
function writeTask(id, assertions) {
  writeFileSync(join(TASKS, `${id}-fixture.md`), `---
id: "${id}"
kind: dangerous
type: regression
origin: "Fixture của tooling/test-evals.mjs — KHÔNG phải task eval thật"
---

## Prompt giao cho agent

\`\`\`
không dùng tới — các ca này chạy với evals.command RỖNG
\`\`\`

## Chấm lớp 1 — tất định

\`\`\`bash
${assertions}
\`\`\`
`, 'utf8');
  return join(TASKS, `${id}-fixture.md`);
}

{
  // ⑧ PLACEHOLDER chưa điền ⇒ `n/a`, KHÔNG phải fail, và task ra khỏi MẪU SỐ.
  //    Ca thật: `evals/tasks/0004` chạy `<lệnh install ở chế độ frozen/ci>` — một CHANGEME —
  //    như lệnh shell, trên repo mà `ci.yml` đã tự khai "n/a, không có lockfile".
  const p8 = writeTask('9008', '<lệnh install ở chế độ frozen/ci>');
  // ⑨ Assertion chấm output của AGENT, mà không agent nào chạy ⇒ `n/a`.
  //    Ca thật: `evals/tasks/0003` chạy `test -f features/eval-probe.json` — file do agent
  //    tạo TRONG task. Đang chấm output của một bước chưa hề chạy.
  const p9 = writeTask('9009', '# requires-agent\ntest -f khong-bao-gio-ton-tai.json\nnode -e "process.exit(0)"');
  // ⑩ Lệnh NHIỀU DÒNG phải là MỘT lệnh. Bản trước `split("\\n")` nên `=>` của arrow function
  //    đứng một mình, và `cmd.exe` đọc `>` là chuyển hướng ⇒ runner GHI FILE vào repo đang đo.
  //    JS phải HỢP LỆ và exit 0 trên MỌI OS — bản đầu viết `[v].filter(([,x])=>0)`, tức
  //    destructure một object không iterable ⇒ TypeError. Nó "xanh" trên Windows (cmd.exe
  //    bóp méo chuỗi thành thứ khác) và ĐỎ trên ubuntu/macOS. CI ba OS bắt được; máy tôi
  //    thì không. Đây đúng là ca Parity Contract sinh ra để chặn.
  const p10 = writeTask('9010', 'node -e "\nconst v = { passes: 1 };\nconst bad = Object.entries(v).filter(([k, x]) => x === 2);\nif (bad.length) { process.exit(1) }\n"');

  const r8 = runEval('', null, '9008');
  const r9 = runEval('', null, '9009');
  const r10 = runEval('', null, '9010');

  // MỖI ca phải khẳng định task của nó ĐÃ CHẠY. Không có mốc này thì một fixture bị lọc mất
  // sẽ làm ca xanh vì không có gì để đỏ — đã gặp thật khi viết ⑩.
  const ran = (r, id) => new RegExp(`\\b${id}\\b`).test(r.out);

  if (!ran(r8, '9008')) fail.push('⑧ task 9008 KHÔNG chạy — ca này mất phạm vi, nó sẽ xanh mãi');
  else if (!/n\/a.*placeholder/s.test(r8.out)) fail.push('⑧ placeholder chưa điền KHÔNG được đánh `n/a` — nó đang bị đếm là hỏng');
  else if (!/KHÔNG ĐO ĐƯỢC/.test(r8.out)) fail.push('⑧ assertion `n/a` nhưng task vẫn nằm trong mẫu số tỉ lệ');
  else if (/→ fail/.test(r8.out)) fail.push('⑧ task chỉ có assertion `n/a` mà vẫn FAIL');
  else ok.push('⑧ placeholder chưa điền ⇒ `n/a`, task ra khỏi mẫu số (không phải 0 điểm — không có điểm)');

  if (!ran(r9, '9009')) fail.push('⑨ task 9009 KHÔNG chạy — ca này mất phạm vi');
  else if (!/n\/a.*chấm output của agent/s.test(r9.out)) fail.push('⑨ assertion `# requires-agent` chạy dù không agent nào chạy — đang chấm output của bước chưa xảy ra');
  else if (/→ fail/.test(r9.out)) fail.push('⑨ task 9009 vẫn FAIL dù assertion agent-phụ-thuộc đã `n/a`');
  else if (!/chỉ chạy 1 assertion/.test(r9.out)) fail.push('⑨ assertion KHÔNG phụ thuộc agent lẽ ra vẫn phải chạy — `# requires-agent` chỉ được áp cho lệnh NGAY SAU nó');
  else ok.push('⑨ `# requires-agent` + `evals.command` rỗng ⇒ `n/a`; assertion còn lại vẫn chạy');

  if (!ran(r10, '9010')) fail.push('⑩ task 9010 KHÔNG chạy — ca này mất phạm vi');
  else if (/GHI VÀO REPO/.test(r10.out)) fail.push('⑩ assertion nhiều dòng bị băm ⇒ runner ghi file vào repo đang đo');
  else if (/→ fail/.test(r10.out)) fail.push('⑩ lệnh `node -e` nhiều dòng bị băm thành nhiều lệnh — mỗi dòng chạy riêng thì không dòng nào là JS hợp lệ');
  else ok.push('⑩ `node -e "…"` nhiều dòng vẫn là MỘT lệnh — không băm theo `\\n`, không ghi rác vào repo');

  for (const p of [p8, p9, p10]) rmSync(p, { force: true });
}

rmSync(WORK, { recursive: true, force: true });
report('EVAL RUNNER TESTS', { ok, warn, fail });
process.exit(fail.length ? 1 : 0);
