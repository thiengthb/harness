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

function runEval(command, mode) {
  const r = spawnSync(process.execPath, [repoPath('evals', 'run.mjs'), '--task', '9001'], {
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

rmSync(WORK, { recursive: true, force: true });
report('EVAL RUNNER TESTS', { ok, warn, fail });
process.exit(fail.length ? 1 : 0);
