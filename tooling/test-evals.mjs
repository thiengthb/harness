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
import { mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
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
  const c = txt.match(/FAKE_AGENT_CWD=("(?:[^"\\]|\\.)*")/);
  const s = txt.match(/FAKE_AGENT_SEES=(\[.*\])/);
  try {
    return {
      argv: a ? JSON.parse(a[1]) : null,
      stdin: p ? JSON.parse(p[1]) : null,
      cwd: c ? JSON.parse(c[1]) : null,
      sees: s ? JSON.parse(s[1]) : null,
    };
  } catch { return null; }
}

// `taskId` mặc định `9001` — ca ①–⑦ đều dùng task đó. Tham số hoá vì ca ⑧⑨⑩ cần task
// RIÊNG: bản trước cứng `--task 9001`, nên một fixture mới ghi vào `TASKS` bị lọc mất và
// ca của nó xanh VÌ KHÔNG CÓ GÌ CHẠY. Đã gặp thật khi viết ⑩ (2026-08-07).
function runEval(command, mode, taskId = '9001', { flags = [], stateDir = null, extraEnv = null } = {}) {
  const r = spawnSync(process.execPath, [repoPath('evals', 'run.mjs'), '--task', taskId, ...flags], {
    cwd: repoPath(''), encoding: 'utf8',
    env: {
      ...process.env,
      HARNESS_CONFIG: writeConfig(command),
      EVAL_TASKS_DIR: TASKS,
      EVAL_ISOLATED: '1',
      // Baseline LÀ trạng thái cục bộ. Không chuyển đi thì suite ghi đè baseline THẬT của
      // người đang chạy nó — và một baseline bị ghi đè là một mốc so sánh mất vĩnh viễn.
      ...(stateDir ? { HARNESS_STATE_DIR: stateDir } : {}),
      ...(mode ? { FAKE_AGENT_MODE: mode } : {}),
      // HÀNG RÀO của fixture: chế độ `writes` từ chối ghi khi nó đứng trong repo thật. Cần thiết
      // vì một mutant phá cô lập sẽ đưa nó về đúng đó — đã xảy ra thật, xem fake-agent.mjs.
      FAKE_AGENT_FORBID_CWD: repoPath(''),
      ...(extraEnv || {}),
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
//
// Từ #147 ca này KHÔNG còn neo vào chuỗi thông báo — ㉒ sở hữu phần đó (phân loại vào rổ nào).
// Thứ CHỈ ④ khẳng định được là **phép cắt có thật sự xảy ra**: agent giả ngủ 60 giây, trần là
// 0.05 phút (3 giây). Nếu `timeout` của `spawnSync` biến mất, runner vẫn in một dòng "không đo
// được" hợp lệ — chỉ khác là nó in sau MỘT PHÚT. Con số thời gian là chỗ duy nhất phân biệt
// "đã cắt" với "đã chờ xong", nên ca này đo con số đó.
{
  const { out } = runEval(CMD, 'hang');
  const mins = Number(out.match(/sau ([\d.]+)p/)?.[1] ?? NaN);
  if (!/trần WALL-CLOCK/.test(out)) fail.push('④ agent treo mà KHÔNG bị cắt ở maxMinutes=0.05 (3 giây) — cap ngân sách không tồn tại');
  else if (!Number.isFinite(mins)) fail.push('④ có báo cắt nhưng KHÔNG in thời gian — không phân biệt được "đã cắt" với "đã chờ xong"');
  else if (mins >= 1) fail.push(`④ báo cắt nhưng agent chạy ${mins}p ≫ trần 0.05p — `
    + '`timeout` của spawnSync không còn tác dụng, và dòng thông báo vẫn đọc như bình thường');
  else ok.push(`④ agent treo ⇒ bị cắt THẬT ở ${mins}p (trần 0.05p), không phải chờ hết 60 giây`);
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
function writeTask(id, assertions, extraSection = '') {
  writeFileSync(join(TASKS, `${id}-fixture.md`), `---
id: "${id}"
kind: dangerous
type: regression
maxTurns: 7
maxMinutes: 0.05
origin: "Fixture của tooling/test-evals.mjs — KHÔNG phải task eval thật"
---
${extraSection}
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

// ── ⑪ Agent hỏng vì HẠ TẦNG ⇒ `?`, KHÔNG phải FAIL (#93) ─────────────────────
//
// Đo 2026-08-07, lần đầu `evals.command` được lấp và chạy thật: ba task trả về sau 0.1 phút
// với `You've hit your session limit`, và runner in `REGRESSION 25% (1/4)`. Agent CHƯA TỪNG
// CHẠY, nhưng assertion — chấm một cây không có gì xảy ra — fail, nên task bị ghi là FAIL.
//
// Một phép đo KHÔNG XẢY RA ghi thành một phép đo THẤT BẠI, và con số đổ về phía "harness chỉ
// bảo vệ được 25%" — hướng khiến người đọc đi CẮT những lớp đang làm việc.
//
// Ca dùng task 9001, mà assertion của nó chạy được và PASS. Nên nếu phép nhận diện hạ tầng
// biến mất, task sẽ PASS chứ không FAIL — và ca vẫn đỏ, vì nó đòi chữ "KHÔNG ĐO ĐƯỢC". Nó
// khoá CẢ HAI chiều nói dối, không chỉ chiều hoảng.
{
  const r = runEval(CMD, 'quota');
  if (!/KHÔNG ĐO ĐƯỢC/.test(r.out)) {
    fail.push('⑪ agent hết quota KHÔNG được đánh "không đo được" — một phép đo chưa xảy ra đang bị ghi thành kết quả');
  } else if (!/HẠ TẦNG \(chạm trần phiên\/quota\)/.test(r.out)) {
    fail.push('⑪ có báo "không đo được" nhưng KHÔNG nói nguyên nhân là hạ tầng — người đọc sẽ đi tìm lỗi ở model');
  } else if (/→ fail/.test(r.out)) {
    fail.push('⑪ task vẫn bị ghi FAIL dù agent chưa từng chạy');
  } else if (/REGRESSION\s+\d/.test(r.out)) {
    fail.push('⑪ task hỏng-hạ-tầng vẫn nằm trong MẪU SỐ tỉ lệ — tỉ lệ đang tính trên một phép đo không xảy ra');
  } else {
    ok.push('⑪ agent hỏng vì hạ tầng (quota) ⇒ `?` kèm nguyên nhân, ra khỏi mẫu số — không phải FAIL');
  }
}

// ── ⑫ POSIX-ism trong assertion — nó chỉ đỏ trên Windows (#102) ──────────────
//
// Assertion chạy qua `spawnSync(cmd, {shell:true})` (`run.mjs:139`). Trên Windows đó là
// **cmd.exe** (`process.env.ComSpec`). Một assertion viết bằng cú pháp POSIX hỏng ở đó và
// XANH trên Linux/macOS — nên nó đi qua CI của hầu hết mọi người mà không ai thấy.
//
// HAI NHÓM, VÀ CHỈ HAI. Đo trực tiếp trên cmd.exe 2026-08-08, chạy y hệt cách runner chạy:
//
//   FAIL  git rev-parse HEAD > /dev/null    "The system cannot find the path specified."
//   FAIL  ... >/dev/null · ... 2>/dev/null
//   PASS  ... 2>&1                    ← cmd.exe CÓ hỗ trợ
//   PASS  test -f AGENTS.md           ← Git-for-Windows để test.exe trong PATH
//   PASS  [ -f AGENTS.md ]            ← và [.exe
//   PASS  echo ok && test -f ...      ← && chạy
//
// Ba nhóm cuối KHÔNG bị chặn: chặn thứ đang chạy được là dương tính giả, và
// `knowledge/lessons/0002-guard-ban-nham.md` là bài học của repo này về đúng chuyện đó.
//
// `$(…)` bị chặn vì lý do KHÁC và tệ hơn: cmd.exe không có command substitution, nên nó so
// **chuỗi literal**. Đo được:
//
//   test "$(echo hi)" = "hi"   → POSIX exit 0, cmd.exe exit 1   ← FAIL GIẢ
//   test -n "$(git rev-parse HEAD)" → cmd.exe exit 0            ← PASS GIẢ (literal khác rỗng)
//
// Tức nó cho kết quả SAI TUỲ Ý, không phải sai một chiều. Một assertion pass giả tệ hơn một
// assertion fail: nó báo an toàn ở nơi không có gì được kiểm.
//
// CHỈ QUÉT KHỐI ĐƯỢC CHẠY. `## Dựng cảnh` và văn xuôi được phép chứa POSIX — runner không
// chạy chúng, chúng là ví dụ cho người đọc.
{
  const POSIX = [
    [/\/dev\/null/, '`/dev/null` — cmd.exe chuyển hướng vào `\\dev\\null`, và assertion ĐỎ bất kể agent làm gì'],
    [/\$\(/, '`$(…)` — cmd.exe không có command substitution, nó so CHUỖI LITERAL ⇒ kết quả sai tuỳ ý (đo được cả pass giả lẫn fail giả)'],
  ];
  const scan = (block) => POSIX.filter(([re]) => re.test(block)).map(([, why]) => why);

  // ⑫a Bộ dò phải THẬT SỰ dò được. Ở template mọi task đều sạch, nên nếu không có ca dương
  //     này thì check sẽ xanh vĩnh viễn và không ai biết nó đã chết. Đây là mẫu số của nó.
  const POS = [
    ['git rev-parse HEAD > /dev/null', 1], ['x >/dev/null', 1], ['x 2>/dev/null', 1],
    ['test -n "$(git rev-parse HEAD)"', 1],
    ['git rev-parse HEAD', 0], ['x 2>&1', 0], ['test -f AGENTS.md', 0], ['[ -f AGENTS.md ]', 0],
    ['echo ok && test -f AGENTS.md', 0],
  ];
  const badDet = POS.filter(([s, n]) => scan(s).length !== n);
  if (badDet.length) fail.push(`⑫a bộ dò POSIX-ism sai ${badDet.length}/${POS.length} ca: ${badDet.map(c => c[0]).join(' · ')}`);
  else ok.push(`⑫a bộ dò POSIX-ism ${POS.length} ca — bắt \`/dev/null\` và \`$(…)\`; KHÔNG bắt \`2>&1\` · \`test -f\` · \`[ … ]\` · \`&&\` (đã đo: chúng chạy trên cmd.exe)`);

  // ⑫b Quét task THẬT của repo này.
  const TASKDIR = repoPath('evals', 'tasks');
  const hits = [];
  let scanned = 0;
  try {
    for (const f of readdirSync(TASKDIR).filter(n => n.endsWith('.md') && !n.startsWith('_'))) {
      const body = readFileSync(join(TASKDIR, f), 'utf8');
      const block = body.match(/## Chấm lớp 1[\s\S]*?```bash\n([\s\S]*?)```/)?.[1];
      if (!block) continue;
      scanned++;
      for (const line of block.split('\n')) {
        if (line.trim().startsWith('#') || !line.trim()) continue;
        for (const why of scan(line)) hits.push(`${f}: \`${line.trim().slice(0, 60)}\` — ${why}`);
      }
    }
  } catch { /* không có thư mục task ⇒ scanned = 0, xử lý ngay dưới */ }

  if (!scanned) {
    warn.push('⑫b KHÔNG có task nào để quét POSIX-ism — check này chưa nói được gì (n/a, KHÔNG phải pass)');
  } else if (hits.length) {
    fail.push(`⑫b ${hits.length} assertion dùng cú pháp POSIX — vi phạm Parity Contract, và chúng chỉ đỏ trên Windows:\n`
      + hits.map(h => `         · ${h}`).join('\n')
      + '\n         Sửa trong task, đừng nới check: một assertion sai IM LẶNG trên một OS thì mọi số nó góp vào đều đáng ngờ.');
  } else {
    ok.push(`⑫b ${scanned} task — không assertion nào dùng \`/dev/null\` hay \`$(…)\``);
  }
}

// ── ⑬⑭⑮ Hai chiều nói dối của MẪU SỐ, và cái chốt chống sửa quá tay (#104) ───
//
// #93 khoá chiều HOẢNG: một phép đo không xảy ra bị ghi thành THẤT BẠI. Ba ca dưới khoá
// chiều còn lại — một phép đo không xảy ra ghi thành **THÀNH CÔNG**. Chiều này im lặng hơn
// hẳn: không ai mở transcript của một task xanh.
//
// Cả ⑬ và ⑭ đều chạy VỚI agent giả và có kết cục PASS nếu bản vá biến mất — nên mốc chung
// của chúng là `REGRESSION` KHÔNG được in ra. Đó là mốc mutant thật: nó đỏ đúng lúc task
// quay lại mẫu số.
{
  // ⑬ Task khai `## Dựng cảnh` ⇒ runner KHÔNG gọi agent. Assertion của nó CHẠY ĐƯỢC và
  //    PASS — cố ý: nếu bản vá biến mất, task này xanh và vào mẫu số, và ca đỏ.
  //    Ca thật: `evals/tasks/0004` — agent được hỏi về một conflict không tồn tại, trả lời
  //    "không có conflict nào", và được chấm PASS (2026-08-07/08).
  const p13 = writeTask('9013', 'node -e "process.exit(0)"', '\n## Dựng cảnh\n\n```bash\ngit switch -c canh-khong-bao-gio-duoc-dung\n```\n');
  // ⑭ Agent CHẠY nhưng mọi assertion đều `n/a` ⇒ vẫn KHÔNG ĐO ĐƯỢC. Một lượt chạy kết thúc
  //    bình thường không phải một phép đo: runner chỉ chấm lớp 1.
  const p14 = writeTask('9014', '<lệnh install ở chế độ frozen/ci>');

  const r13 = runEval(CMD, 'ok', '9013');
  const r14 = runEval(CMD, 'ok', '9014');
  const r15 = runEval(CMD, 'ok', '9001');
  const ran = (r, id) => new RegExp(`\\b${id}\\b`).test(r.out);

  if (!ran(r13, '9013')) fail.push('⑬ task 9013 KHÔNG chạy — ca này mất phạm vi, nó sẽ xanh mãi');
  else if (/transcript:/.test(r13.out)) fail.push('⑬ runner GỌI AGENT cho task có `## Dựng cảnh` — đã trả tiền cho một lượt chạy hỏi về tình huống chưa được dựng');
  else if (!/Dựng cảnh/.test(r13.out)) fail.push('⑬ task bị bỏ qua nhưng runner không nói lý do là `## Dựng cảnh`');
  else if (!/KHÔNG ĐO ĐƯỢC/.test(r13.out)) fail.push('⑬ task có cảnh chưa dựng vẫn được coi là đã đo');
  else if (/REGRESSION\s+\d/.test(r13.out)) fail.push('⑬ task có `## Dựng cảnh` VẪN nằm trong mẫu số — nó đang góp điểm cho một phép đo không xảy ra');
  else ok.push('⑬ `## Dựng cảnh` ⇒ KHÔNG gọi agent, KHÔNG chấm, ra khỏi mẫu số, và nói ra lý do');

  if (!ran(r14, '9014')) fail.push('⑭ task 9014 KHÔNG chạy — ca này mất phạm vi');
  else if (!/KHÔNG ĐO ĐƯỢC/.test(r14.out)) fail.push('⑭ agent chạy xong ⇒ task vào mẫu số dù KHÔNG assertion nào chạy được — exit code của agent đang bị đọc thành điểm');
  else if (!/agent ĐÃ CHẠY/.test(r14.out)) fail.push('⑭ có báo "không đo được" nhưng không phân biệt được với ca "chưa khai evals.command" — hai việc phải làm khác nhau');
  else if (/REGRESSION\s+\d/.test(r14.out)) fail.push('⑭ task 0 assertion vẫn nằm trong MẪU SỐ tỉ lệ');
  else ok.push('⑭ agent chạy + mọi assertion `n/a` ⇒ vẫn KHÔNG ĐO ĐƯỢC (runner chỉ chấm lớp 1)');

  // ⑮ CHỐT CHỐNG SỬA QUÁ TAY. ⑬⑭ đòi mẫu số CO LẠI; ca này đòi nó không co về 0. Không có
  //    nó, một `measured = false` cứng cũng làm ⑬⑭ xanh — và lớp eval im lặng thành vô dụng.
  if (!/REGRESSION\s+100%\s+\(1\/1\)/.test(r15.out)) {
    fail.push('⑮ task CÓ assertion chạy được + agent chạy xong lại KHÔNG vào mẫu số — bản vá #104 cắt quá tay, tỉ lệ giờ tính trên tập rỗng');
  } else ok.push('⑮ task có ≥1 assertion chạy được vẫn vào mẫu số bình thường — bản vá #104 không cắt quá tay');

  for (const p of [p13, p14]) rmSync(p, { force: true });
}

// ── ⑯–⑳ `--bare` là một CƠ CHẾ, không phải một cái nhãn (#91) ────────────────
//
// Tới 2.42.4, `--bare` đổi tên file baseline, đổi tiêu đề, đổi lời nhắn cuối — và
// `spawnSync` trong `runAgent()` **không nhận nó**: cùng `cwd`, cùng bộ hook. Hai lần chạy đo
// cùng một thứ, nên `eval − eval --bare` luôn ≈ 0. Mà `docs/adr/harness/0002` đặt đúng phép
// trừ đó làm chỉ số trung tâm, và runner dạy người đọc rằng chênh lệch nhỏ nghĩa là *"phần lớn
// harness của bạn là dead weight"*.
//
// Năm ca dưới khoá năm nửa khác nhau, và hai trong số đó khoá chiều NGƯỢC (gỡ quá tay, trừ
// trên hai mẫu số khác nhau) — vì một cơ chế "gỡ harness" sai theo chiều đó vẫn cho ra số.
{
  const BARE_STATE = join(WORK, 'state-bare');
  mkdirSync(BARE_STATE, { recursive: true });
  const NEUTRAL = 'node -e "process.exit(0)"';
  // Assertion ĐỌC lớp harness: xanh ở cây đầy đủ, đỏ ở cây trần — mà agent không liên quan.
  // Đây là dạng thật của `0001` (`node tooling/test-hooks.mjs` đọc `.claude/`).
  const READS_HARNESS = 'node -e "process.exit(require(\'fs\').existsSync(\'AGENTS.md\')?0:1)"';

  // ⑯ `--bare` mà `evals.command` rỗng ⇒ TỪ CHỐI. Không agent nào chạy thì hai lần đo chạy
  //    cùng assertion trên cùng trạng thái cây — chênh lệch 0 là DO CẤU TRÚC. Đây chính là
  //    trạng thái mọi repo đang có, nên nó là ca hay nổ nhất.
  {
    const r = runEval('', null, '9001', { flags: ['--bare'] });
    if (r.status === 0) fail.push('⑯ `--bare` + `evals.command` rỗng vẫn chạy — nó sắp in ra một chênh lệch 0 DO CẤU TRÚC như thể là phát hiện');
    else if (/HARNESS TRẦN/.test(r.out)) fail.push('⑯ runner in tiêu đề khẳng định `EVAL (HARNESS TRẦN)` cho một lần chạy nó từ chối thực hiện');
    else if (!/TỪ CHỐI/.test(r.out)) fail.push('⑯ thoát khác 0 nhưng không nói TỪ CHỐI vì lý do gì');
    else ok.push('⑯ `--bare` + `evals.command` rỗng ⇒ TỪ CHỐI kèm lý do, không in tiêu đề khẳng định');
  }

  // ⑰ HỢP ĐỒNG CHÍNH: agent chạy trong một CÂY KHÁC, và từ đó KHÔNG đọc được lớp harness.
  //    Hai nửa, và nửa thứ hai quan trọng ngang nửa thứ nhất: `tooling/` + `harness.config.json`
  //    PHẢI còn, vì assertion lớp 1 gọi thẳng vào đó. Gỡ sạch mọi thứ thì lần chạy trần đo
  //    "harness còn tồn tại không", không đo "agent có hành xử khác không".
  {
    const p = writeTask('9016', NEUTRAL);
    const r = runEval(CMD, 'ok', '9016', { flags: ['--bare'] });
    const got = received(r.out);
    const HIDDEN = ['AGENTS.md', 'CLAUDE.md', '.claude/settings.json', '.claude/rules'];
    if (!got?.cwd) fail.push('⑰ không đọc được `FAKE_AGENT_CWD` từ transcript — agent không chạy, hoặc fixture không khai chỗ nó đứng');
    else if (got.cwd === repoPath('')) fail.push('⑰ agent chạy trong CHÍNH repo đang đo — `--bare` vẫn là một cái nhãn, đúng chế độ hỏng của #91');
    else if (!Array.isArray(got.sees)) fail.push('⑰ không đọc được `FAKE_AGENT_SEES`');
    else if (got.sees.some(f => HIDDEN.includes(f))) fail.push(`⑰ cây trần VẪN còn lớp harness agent đọc được: ${got.sees.filter(f => HIDDEN.includes(f)).join(' · ')}`);
    else if (!got.sees.includes('tooling') || !got.sees.includes('harness.config.json')) fail.push('⑰ gỡ QUÁ TAY: `tooling/` hoặc `harness.config.json` cũng biến mất — assertion lớp 1 gọi thẳng vào đó, lần chạy trần sẽ đo nhầm thứ');
    else ok.push('⑰ agent chạy trong cây trần dùng-một-lần: gỡ memory + settings + rules/skills/agents, GIỮ `tooling/` và config');
    rmSync(p, { force: true });
  }

  // ⑱ TIỀN KIỂM. Assertion đọc lớp harness sẽ đỏ trên cây trần dù agent làm đúng. Không có
  //    tiền kiểm, task đó ĐỎ ở lần trần và XANH ở lần đầy đủ, rồi phép trừ ghi chênh lệch đó
  //    vào cột "giá trị của harness" — một số 0 do cấu trúc được thay bằng một số DƯƠNG do
  //    cấu trúc. Sai theo hướng dễ chịu hơn thì vẫn sai.
  {
    const p = writeTask('9017', `${NEUTRAL}\n${READS_HARNESS}`);
    const r = runEval(CMD, 'ok', '9017', { flags: ['--bare'] });
    if (!/\b9017\b/.test(r.out)) fail.push('⑱ task 9017 KHÔNG chạy — ca này mất phạm vi');
    else if (/→ fail/.test(r.out)) fail.push('⑱ assertion đọc lớp harness bị chấm FAIL trên cây trần — chênh lệch đó sẽ được ghi thành "giá trị của harness"');
    else if (!/ĐỎ SẴN trên cây trần/.test(r.out)) fail.push('⑱ không có tiền kiểm: runner không phân biệt được "assertion đo agent" với "assertion đo lớp harness"');
    else if (!/REGRESSION\s+\d/.test(r.out)) fail.push('⑱ tiền kiểm loại QUÁ TAY — task còn assertion trung lập chạy được thì vẫn phải ở trong mẫu số');
    else ok.push('⑱ assertion đỏ sẵn trên cây trần ⇒ `n/a` (nó đo lớp harness), assertion trung lập vẫn chấm bình thường');
    rmSync(p, { force: true });
  }

  // ⑲ ĐO ĐƯỢC Ở CẢ HAI CHIỀU **KHÔNG** ĐỦ ĐỂ TRỪ — mẫu số phải bằng nhau.
  //
  //    Ca này TRƯỚC ĐÂY khẳng định điều ngược lại (*"task có cả assertion trung lập lẫn
  //    assertion đọc harness ⇒ so được"*), và nó đã xanh suốt. Nó xanh vì nó khoá đúng cái
  //    lỗi: `passed` là "mọi assertion CHẠY ĐƯỢC đều xanh", nên task này được chấm trên 2
  //    assertion ở chiều đầy đủ và **1** ở chiều trần. Hai boolean sinh ra từ hai mẫu số,
  //    rồi bị trừ cho nhau.
  //
  //    Chiều lệch luôn cùng một hướng — bên trần LUÔN mất assertion, không bao giờ được thêm —
  //    nên sai số không tự triệt tiêu qua nhiều task: nó dồn về phía *"harness không giúp gì"*.
  //    Đo 2026-08-10 trên 7 task thật: 22 assertion sống ở chiều đầy đủ, 13 ở chiều trần.
  {
    const p = writeTask('9018', `${NEUTRAL}\n${READS_HARNESS}`);
    runEval(CMD, 'ok', '9018', { flags: ['--baseline'], stateDir: BARE_STATE });
    const r = runEval(CMD, 'ok', '9018', { flags: ['--bare'], stateDir: BARE_STATE });
    if (/đầy đủ \d+%\s+−\s+trần \d+%\s+=\s+[+-]?\d+pp/.test(r.out)) fail.push('⑲ trừ hai vế chấm trên HAI MẪU SỐ khác nhau (2 assertion vs 1) — con số ra là hiện vật của dụng cụ, và nó nói dối theo chiều dễ chịu');
    else if (!/MẪU SỐ LỆCH/.test(r.out)) fail.push('⑲ loại task đúng nhưng KHÔNG nói vì sao — người đọc thấy task biến mất khỏi phép trừ mà không biết phải sửa ở TASK');
    else if (!/đầy đủ 2 · trần 1 assertion/.test(r.out)) fail.push('⑲ không nêu CẶP SỐ mẫu số — "lệch" mà không nói lệch bao nhiêu thì không hành động được');
    else ok.push('⑲ mẫu số lệch ⇒ task ra khỏi phép trừ, kèm cặp số và chỗ phải sửa (task, không phải runner)');
    rmSync(p, { force: true });
  }

  // ⑲b CHIỀU NGƯỢC — BẮT BUỘC. Không có ca này, một bản vá loại SẠCH mọi task vẫn xanh ở ⑲,
  //     và phép trừ chết im lặng: mẫu số về 0 thì không gì đỏ được nữa (L0007).
  //     Hai assertion TRUNG LẬP ⇒ mẫu số 2 ở cả hai chiều ⇒ PHẢI vẫn trừ được.
  {
    const p = writeTask('9030', `${NEUTRAL}\n${NEUTRAL}`);
    runEval(CMD, 'ok', '9030', { flags: ['--baseline'], stateDir: BARE_STATE });
    const r = runEval(CMD, 'ok', '9030', { flags: ['--bare'], stateDir: BARE_STATE });
    if (/MẪU SỐ LỆCH/.test(r.out)) fail.push('⑲b hai chiều CÙNG mẫu số mà vẫn bị loại — bản vá cắt quá tay, phép trừ không bao giờ ra số nữa');
    else if (!/đầy đủ \d+%\s+−\s+trần \d+%\s+=\s+[+-]?\d+pp/.test(r.out)) fail.push('⑲b task so được mà runner không trừ — mẫu số đã về 0, không gì đỏ được nữa');
    else if (!/trên 1 task so được/.test(r.out)) fail.push('⑲b phép trừ không nói MẪU SỐ — "chênh 0" trên 1 task khác hẳn "chênh 0" trên 5');
    else ok.push('⑲b cùng mẫu số ⇒ VẪN trừ, và nói ra số task so được — bản vá ⑲ không cắt quá tay');
    rmSync(p, { force: true });
  }

  // ⑲d THỨ TỰ CHẠY NGƯỢC — `--bare --baseline` trước, đầy đủ sau. Luồng hợp lệ (`basePath`
  //     đổi tên theo `BARE`, nên chiều trần ghi được baseline của riêng nó), và nó đi qua
  //     nhánh `BARE === false` của thông điệp lệch — nhánh mà ⑲/⑲b/⑲c KHÔNG chạm tới.
  //
  //     Cặp số trong thông điệp lấy từ `BARE ? b : a`. Đảo nhầm hai vế thì con số vẫn IN RA,
  //     vẫn đúng định dạng, chỉ **gán sai nhãn** — và người đọc đi thu hẹp nhầm task. Đây là
  //     chiều thứ hai của cùng bản vá (L0007): chiều ồn ào đã có ca, chiều này thì không.
  {
    const p = writeTask('9032', `${NEUTRAL}\n${READS_HARNESS}`);
    runEval(CMD, 'ok', '9032', { flags: ['--bare', '--baseline'], stateDir: BARE_STATE });
    const r = runEval(CMD, 'ok', '9032', { stateDir: BARE_STATE });
    if (!/MẪU SỐ LỆCH/.test(r.out)) fail.push('⑲d chạy trần TRƯỚC ⇒ phép so mẫu số không nổ — nhánh `BARE === false` chưa từng được thử');
    else if (!/đầy đủ 2 · trần 1 assertion/.test(r.out)) fail.push('⑲d cặp số bị ĐẢO khi thứ tự chạy đảo — số vẫn in ra, vẫn đúng định dạng, chỉ gán sai nhãn ⇒ người đọc đi thu hẹp nhầm task');
    else ok.push('⑲d thứ tự chạy ngược ⇒ vẫn bắt lệch, và cặp số vẫn gán ĐÚNG vế (đầy đủ 2 · trần 1)');
    rmSync(p, { force: true });
  }

  // ⑲c Baseline KHÔNG ghi `ran` (bản cũ) ⇒ `?`, không phải "bằng nhau". Trạng thái thứ ba, áp
  //     cho chính dụng cụ: chưa biết mẫu số có bằng nhau không thì chưa trừ được.
  {
    const p = writeTask('9031', NEUTRAL);
    runEval(CMD, 'ok', '9031', { flags: ['--baseline'], stateDir: BARE_STATE });
    const bp = join(BARE_STATE, 'eval-baseline.json');
    const b = JSON.parse(readFileSync(bp, 'utf8'));
    for (const x of b.results) delete x.ran;          // giả lập baseline sinh trước bản vá này
    writeFileSync(bp, JSON.stringify(b));
    const r = runEval(CMD, 'ok', '9031', { flags: ['--bare'], stateDir: BARE_STATE });
    if (/đầy đủ \d+%\s+−\s+trần \d+%/.test(r.out)) fail.push('⑲c baseline cũ không ghi mẫu số mà runner vẫn trừ — nó đang GIẢ ĐỊNH hai vế bằng nhau, đúng giả định bản vá này ra đời để gỡ');
    else if (!/chưa biết mẫu số/.test(r.out)) fail.push('⑲c bỏ qua baseline cũ mà không nói lý do — người đọc tưởng task không đo được, và sẽ đi sửa nhầm chỗ');
    else ok.push('⑲c baseline cũ thiếu `ran` ⇒ `?` kèm cách đi tiếp, KHÔNG suy ra "mẫu số bằng nhau"');
    rmSync(p, { force: true });
  }

  // ⑳ GIAO RỖNG ⇒ `?`. Task chỉ có assertion đọc lớp harness: đo được ở lần đầy đủ, KHÔNG đo
  //    được ở lần trần. Trừ hai tỉ lệ đó bằng mắt cho ra `100% − 0%` — một con số bịa hoàn
  //    toàn. Đây là chiều nói dối mà chính bản vá này có thể sinh ra nếu làm ẩu.
  {
    const p = writeTask('9019', READS_HARNESS);
    runEval(CMD, 'ok', '9019', { flags: ['--baseline'], stateDir: BARE_STATE });
    const r = runEval(CMD, 'ok', '9019', { flags: ['--bare'], stateDir: BARE_STATE });
    if (/đầy đủ \d+%\s+−\s+trần \d+%/.test(r.out)) fail.push('⑳ trừ hai lần chạy KHÔNG có task nào chung — con số in ra không nói về cái gì cả');
    else if (!/không task nào SO ĐƯỢC/.test(r.out)) fail.push('⑳ giao rỗng mà runner không nói `?` — im lặng ở đây đọc thành "chưa chạy phép trừ"');
    else ok.push('⑳ giao rỗng ⇒ `?` kèm số task mỗi bên, KHÔNG bịa ra một hiệu số');
    rmSync(p, { force: true });
  }
}

// ── ㉑ Cạn ngân sách LƯỢT ≠ agent làm sai (#147) ─────────────────────────────
//
// Ca ⑪ khoá đúng lớp lỗi này cho HẠ TẦNG. Ca này khoá nó cho NGÂN SÁCH — trạng thái thứ tư,
// và là trạng thái duy nhất mà `claude -p` thoát KHÁC 0, nên nó rơi thẳng vào `FAIL`.
//
// Đo 2026-08-10: ba task hết lượt in ra `REGRESSION 0% (0/3)`. Một trong ba (`0007`) thực ra
// làm việc ĐÚNG tới lúc cạn — nó viết 7 ca test có răng thật, và bị chấm là thất bại. Con số
// 0% đó không đo harness, nó đo turn budget.
//
// Ca dùng task 9001 mà assertion CHẠY ĐƯỢC và PASS. Nên nếu phép nhận diện biến mất, task sẽ
// hiện ra là FAIL (vì exit 1) — và ca vẫn đỏ. Nó khoá cả hai chiều nói dối, như ⑪.
{
  const r = runEval(CMD, 'maxturns');
  if (!/KHÔNG ĐO ĐƯỢC/.test(r.out)) {
    fail.push('㉑ agent cạn trần LƯỢT KHÔNG được đánh "không đo được" — một phép đo chưa xảy ra đang bị ghi thành THẤT BẠI');
  } else if (!/CẠN NGÂN SÁCH \(chạm trần LƯỢT/.test(r.out)) {
    fail.push('㉑ có báo "không đo được" nhưng KHÔNG nói nguyên nhân là ngân sách — người đọc sẽ đi tìm lỗi ở model');
  } else if (/HẠ TẦNG/.test(r.out)) {
    fail.push('㉑ cạn ngân sách bị gộp vào rổ HẠ TẦNG — hai nguyên nhân, hai việc phải làm, và "chạy lại" là lời khuyên SAI ở đây');
  } else if (!/CHẠY LẠI KHÔNG GIÚP GÌ/.test(r.out)) {
    fail.push('㉑ không nói rằng chạy lại vô ích — đó là khác biệt DUY NHẤT về hành động so với ca hạ tầng');
  } else if (/→ fail/.test(r.out)) {
    fail.push('㉑ task vẫn bị ghi FAIL dù agent chưa kịp trả lời');
  } else if (/REGRESSION\s+\d/.test(r.out)) {
    fail.push('㉑ task cạn-ngân-sách vẫn nằm trong MẪU SỐ — tỉ lệ đang tính trên một phép đo không xảy ra');
  } else {
    ok.push('㉑ agent cạn trần LƯỢT ⇒ `?` kèm nguyên nhân + "chạy lại không giúp gì", ra khỏi mẫu số — không phải FAIL');
  }
}

// ── ㉒ Cạn ngân sách WALL-CLOCK đi cùng đường ────────────────────────────────
//
// Nguồn KHÁC: trần lượt để lại chữ trong output, trần thời gian thì KHÔNG — `spawnSync` chỉ
// báo bằng `signal === 'SIGTERM'`. Chế độ `hang` của agent giả đã tồn tại từ lâu và đi đúng
// đường đó, nhưng trước #147 nó chỉ được một dòng WARN rồi task vẫn thành FAIL.
//
// Không có ca này, một bản vá chỉ nối `budgetExhausted(text)` sẽ xanh — và nửa còn lại của
// cùng một lớp lỗi vẫn im lặng.
{
  const r = runEval(CMD, 'hang');
  if (!/KHÔNG ĐO ĐƯỢC/.test(r.out)) {
    fail.push('㉒ agent bị cắt vì WALL-CLOCK vẫn không được đánh "không đo được" — nửa còn lại của #147');
  } else if (!/CẠN NGÂN SÁCH \(chạm trần WALL-CLOCK/.test(r.out)) {
    fail.push('㉒ có báo "không đo được" nhưng không nêu trần WALL-CLOCK — hai nguồn phải nói ra nguồn nào');
  } else if (/REGRESSION\s+\d/.test(r.out)) {
    fail.push('㉒ task bị cắt vì thời gian vẫn nằm trong MẪU SỐ');
  } else {
    ok.push('㉒ agent cạn trần WALL-CLOCK ⇒ cùng rổ `?`, và dòng báo nêu ĐÚNG nguồn (SIGTERM, không phải chữ trong output)');
  }
}

// ── ㉓ Phong bì CÓ CẤU TRÚC: số lượt đã dùng là SỐ ĐO, không phải khảo cổ ────
//
// `--output-format json` đổi lời khai của agent từ văn xuôi sang một object. `num_turns` là
// con số duy nhất chưa có để hiệu chỉnh `maxTurns` bằng đo thay vì bằng ý kiến (#144).
//
// Ca này neo vào CẶP `dùng/trần`, không neo vào riêng con số: một trần in ra một mình không
// nói gì về chỗ thở còn lại, và chính "còn bao nhiêu chỗ thở" mới là thứ quyết định task này
// còn nằm trong mẫu số ở lần chạy sau hay không.
{
  const r = runEval(CMD, 'json', '9001', { extraEnv: { FAKE_AGENT_TURNS: '3' } });
  if (!/3\/7 lượt/.test(r.out)) {
    fail.push(`㉓ runner KHÔNG đọc được \`num_turns\` từ phong bì JSON — hiệu chỉnh maxTurns quay lại làm khảo cổ transcript`);
  } else if (/KHÔNG ĐO ĐƯỢC/.test(r.out)) {
    fail.push('㉓ phong bì THÀNH CÔNG bị đọc thành "không đo được" — phép đọc đang bắn nhầm vào ca xanh');
  } else if (/TRẦN LƯỢT SẮP BÓ/.test(r.out)) {
    fail.push('㉓ 3/7 lượt (43%) mà đã kêu "trần sắp bó" — ngưỡng bắn nhầm, và cảnh báo bắn nhầm sẽ bị tắt');
  } else {
    ok.push('㉓ phong bì JSON ⇒ runner đọc ra SỐ LƯỢT đã dùng (3/7), không kêu oan');
  }
}

// ── ㉔ Cạn trần lượt KHAI BẰNG CẤU TRÚC — và KHÔNG có chữ nào để regex ───────
//
// ĐÂY LÀ CA CỦA #153. Ở chế độ JSON, chuỗi `Reached max turns` **không tồn tại**: agent khai
// bằng `terminal_reason: "max_turns"`. Nên `budgetExhausted()` — regex trên văn xuôi, v2.51.0 —
// mù hoàn toàn, và task rơi lại vào FAIL: đúng lớp lỗi #147 vừa dọn, qua một đường khác.
//
// Và đường đó KHÔNG phải giả định: docstring của `runAgent` lấy `--output-format json` làm
// VÍ DỤ MẪU. Người làm theo tài liệu là người dính.
//
// Phép khẳng định thứ hai là phần có răng: transcript KHÔNG được chứa chữ ký văn xuôi. Không
// có nó, một agent giả in cả JSON lẫn dòng chữ sẽ làm ca này xanh qua đường CŨ, và cơ chế mới
// chưa từng được chạy.
{
  const r = runEval(CMD, 'jsonmaxturns');
  const m = r.out.match(/transcript: (\S+)/);
  const txt = m ? readFileSync(m[1], 'utf8') : '';
  if (/reached max turns/i.test(txt)) {
    fail.push('㉔ agent giả vẫn in chữ ký VĂN XUÔI — ca này đang đo đường cũ, cơ chế phong bì chưa từng chạy');
  } else if (!/KHÔNG ĐO ĐƯỢC/.test(r.out)) {
    fail.push('㉔ cạn trần lượt KHAI BẰNG CẤU TRÚC vẫn bị chấm — bật `--output-format json` (đúng ví dụ trong docstring) làm bộ dò #147 mù');
  } else if (!/CẠN NGÂN SÁCH \(chạm trần LƯỢT/.test(r.out)) {
    fail.push('㉔ có báo "không đo được" nhưng không nói nguyên nhân là trần LƯỢT');
  } else if (/REGRESSION\s+\d/.test(r.out)) {
    fail.push('㉔ task cạn trần lượt vẫn nằm trong MẪU SỐ');
  } else {
    ok.push('㉔ `terminal_reason: max_turns` ⇒ `?` — nhận diện theo CẤU TRÚC, không cần một chữ nào trong output');
  }
}

// ── ㉕ Trần SẮP BÓ phải kêu — chiều còn lại của ㉓ ────────────────────────────
//
// ㉓ khoá chiều "đừng kêu oan". Một mình nó thì một bản vá xoá hẳn cảnh báo sẽ XANH — đúng
// chiều `L0007` (sửa quá tay: mẫu số về 0 và không gì đỏ). Ca này khoá chiều còn lại.
//
// 6/7 = 86% ≥ `budget.alertAtPercent` (80, mặc định). Task này còn ĐO ĐƯỢC — nên cảnh báo phải
// tồn tại mà KHÔNG được đẩy task ra khỏi mẫu số: một task xanh bị đọc thành `?` cũng là nói dối.
{
  const r = runEval(CMD, 'json', '9001', { extraEnv: { FAKE_AGENT_TURNS: '6' } });
  if (!/TRẦN LƯỢT SẮP BÓ/.test(r.out)) {
    fail.push('㉕ dùng 6/7 lượt mà KHÔNG cảnh báo — lần chạy sau task rơi khỏi mẫu số và tỉ lệ đổi mà không dòng nào giải thích');
  } else if (!/6\/7 lượt/.test(r.out)) {
    fail.push('㉕ có cảnh báo nhưng không nêu CẶP SỐ — "sắp bó" mà không nói sắp bó tới đâu thì không hành động được');
  } else if (/KHÔNG ĐO ĐƯỢC/.test(r.out)) {
    fail.push('㉕ trần sắp bó bị đẩy thành "không đo được" — task này ĐO ĐƯỢC, cảnh báo không được ăn mất phép đo');
  } else {
    ok.push('㉕ dùng 6/7 lượt (≥ alertAtPercent) ⇒ CẢNH BÁO nêu cặp số, task vẫn nằm trong mẫu số');
  }
}

// ── ㉖ Agent NÓI VỀ chữ ký ngân sách ≠ agent cạn ngân sách ───────────────────
//
// Chiều nói dối IM LẶNG của ㉔. `budgetExhausted()` quét TOÀN BỘ stdout; ở chế độ JSON, stdout
// chứa cả câu trả lời của agent. Một agent viết *"gate này chặn khi reached max turns"* — câu
// hoàn toàn hợp lệ cho một task về gate — sẽ bị chấm là cạn ngân sách, và một task XANH lặng
// lẽ rơi khỏi MẪU SỐ. Tỉ lệ đổi, không dòng nào giải thích.
//
// Đây là ca duy nhất chứng minh quyết định *"có phong bì thì phong bì là nguồn DUY NHẤT"*.
// Viết `envelopeBudget(env) ?? budgetExhausted(text)` thì ca này ĐỎ — và đó chính là bản đầu
// tôi định viết.
{
  const r = runEval(CMD, 'json', '9001', {
    extraEnv: { FAKE_AGENT_TURNS: '3', FAKE_AGENT_SAY: 'Gate này chặn đúng khi CLI báo Reached max turns, nên tôi giữ nguyên.' },
  });
  if (/KHÔNG ĐO ĐƯỢC/.test(r.out)) {
    fail.push('㉖ agent NÓI VỀ chữ ký ngân sách bị chấm là CẠN ngân sách — một task xanh vừa im lặng rơi khỏi mẫu số');
  } else if (!/3\/7 lượt/.test(r.out)) {
    fail.push('㉖ mất luôn số lượt — phong bì không còn được đọc ở ca này');
  } else {
    ok.push('㉖ phong bì khai "completed" ⇒ chữ ký trong CÂU TRẢ LỜI của agent không bị đọc thành cạn ngân sách');
  }
}

const NEUTRAL_155 = 'node -e "process.exit(0)"';

// ── ㉗ Chiều ĐẦY ĐỦ cũng chạy trong cây dùng một lần (#155) ──────────────────
//
// `eval − eval --bare` là một phép trừ. Để hiệu số nói về HARNESS, hai lần chạy phải khác nhau
// ở ĐÚNG MỘT THỨ. Tới 2.52.1 chiều trần chạy trong clone, chiều đầy đủ chạy trong **repo
// SỐNG** — khác nhau thêm ở lịch sử git, ở `origin`, và ở mọi file chưa commit.
//
// Ca này là ⑰ soi gương: cùng phép khẳng định, chiều còn lại, và **vế thứ hai đảo dấu** —
// cây đầy đủ phải GIỮ NGUYÊN lớp harness. Không có vế đó, một bản vá "cô lập cả hai chiều"
// bằng cách gỡ file ở cả hai sẽ xanh, và phép trừ ra 0 do cấu trúc.
{
  const p = writeTask('9019', NEUTRAL_155);
  const r = runEval(CMD, 'ok', '9019');
  const got = received(r.out);
  const HARNESS = ['AGENTS.md', 'CLAUDE.md', '.claude/settings.json', '.claude/rules'];
  if (!got?.cwd) {
    fail.push('㉗ không đọc được `FAKE_AGENT_CWD` — agent không chạy');
  } else if (got.cwd === repoPath('')) {
    fail.push('㉗ chiều ĐẦY ĐỦ vẫn chạy trong repo SỐNG — hai chiều của phép trừ khác nhau ở lịch sử git, `origin`, và file chưa commit, nên hiệu số chưa nói về harness (#155)');
  } else if (!/CÂY ĐẦY ĐỦ \(dùng một lần\)/.test(r.out)) {
    fail.push('㉗ cây cô lập rồi nhưng runner KHÔNG nói ra — người đọc tưởng agent vừa chạy trong repo của họ');
  } else if (!Array.isArray(got.sees) || HARNESS.some(f => !got.sees.includes(f))) {
    fail.push(`㉗ cây ĐẦY ĐỦ bị gỡ mất lớp harness: thiếu ${HARNESS.filter(f => !got.sees?.includes(f)).join(' · ')} — hai chiều nay giống nhau, phép trừ ra 0 DO CẤU TRÚC`);
  } else {
    ok.push('㉗ chiều ĐẦY ĐỦ cũng là cây dùng-một-lần, và nó GIỮ NGUYÊN lớp harness — hai chiều chỉ khác nhau ở `BARE_STRIP`');
  }
  rmSync(p, { force: true });
}

// ── ㉘ KHÔNG có agent ⇒ KHÔNG clone: giữ nghĩa "trạng thái HIỆN TẠI" ─────────
//
// Khi `evals.command` rỗng, runner cố ý đo cây bạn ĐANG làm việc — dòng cảnh báo của nó nói
// đúng chữ đó. Clone lúc ấy bỏ mất mọi thứ chưa commit và đổi nghĩa của chính dòng nó in,
// trong khi KHÔNG có agent nào để cô lập. Cô lập là câu trả lời cho một câu hỏi chưa được hỏi.
{
  const p = writeTask('9020', NEUTRAL_155);
  const r = runEval('', null, '9020');
  if (/dùng một lần/.test(r.out)) {
    fail.push('㉘ dựng cây cô lập khi KHÔNG có agent — phép đo "trạng thái HIỆN TẠI" nay bỏ qua mọi thứ chưa commit, im lặng');
  } else if (!/trạng thái HIỆN TẠI/.test(r.out)) {
    fail.push('㉘ mất dòng nói rằng đang đo trạng thái hiện tại — neo của ca này đã trôi');
  } else {
    ok.push('㉘ `evals.command` rỗng ⇒ KHÔNG clone, vẫn đo cây đang làm việc như dòng nó in');
  }
  rmSync(p, { force: true });
}

// ── ㉙ Cây bị xoá, nhưng VIỆC AGENT LÀM thì không ────────────────────────────
//
// Hệ quả bắt buộc của ㉗. Hai lần thu hoạch thật của cả lớp eval đến từ việc agent sửa cây, và
// cả hai lần điểm số nói ngược: PR #149 (7 ca test, task bị chấm FAIL vì cạn trần lượt) và
// PR #157 (trạng thái `n/a` cho bảng nghi thức). Cô lập cây mà không rút patch ra thì bản vá
// #155 **phá một thứ đang có giá trị**, và không ai biết — thứ bị mất chưa bao giờ có tên
// trong báo cáo.
//
// Ca khẳng định BA điều, và điều thứ ba là điều đắt nhất:
//   ① runner NÊU TÊN file patch;
//   ② patch chứa đúng thay đổi (áp lại được);
//   ③ repo THẬT không bị đụng — tức cây đúng là cô lập, không phải một cái nhãn (#91 lần nữa).
{
  const p = writeTask('9021', NEUTRAL_155);
  const realAgents = readFileSync(repoPath('AGENTS.md'), 'utf8');
  const r = runEval(CMD, 'writes', '9021');
  const m = r.out.match(/patch: (\S+)/);
  const patch = m ? (() => { try { return readFileSync(m[1], 'utf8'); } catch { return ''; } })() : '';
  if (!m) {
    fail.push('㉙ agent SỬA CÂY mà runner không nêu tên patch — cây bị xoá và việc agent làm biến mất không dấu vết (PR #149 và #157 đều ra đời từ đúng chỗ này)');
  } else if (!/DÒNG DO AGENT GIẢ THÊM/.test(patch)) {
    fail.push(`㉙ có file patch nhưng KHÔNG chứa thay đổi của agent — một patch rỗng tệ hơn không có patch, nó nói dối rằng đã cứu được việc`);
  } else if (!/^\+\+\+ b\/AGENTS\.md$/m.test(patch)) {
    fail.push('㉙ patch không ở dạng diff áp lại được — nó phải là thứ `git apply` nhận, không phải một bản chụp văn bản');
  } else if (readFileSync(repoPath('AGENTS.md'), 'utf8') !== realAgents) {
    fail.push('㉙ AGENTS.md của REPO THẬT vừa bị agent sửa — cây "cô lập" là một cái nhãn');
  } else {
    ok.push('㉙ agent sửa cây ⇒ patch được RÚT RA và nêu tên, áp lại được, và repo thật không đụng tới');
  }
  rmSync(p, { force: true });
}

// ── ㉙b Patch của chiều TRẦN là việc AGENT làm, không phải việc `--bare` làm ──
//
// ㉙ khoá chiều đầy đủ. Chiều trần có thêm một bước mà chiều kia không có — `evalTree` đổi tên
// 7 mục của `BARE_STRIP` SAU khi clone. `capturePatch` chụp bằng `git add -A` + commit, nên
// mọi thứ chưa commit đều vào patch, kể cả việc của chính `--bare`.
//
// Đo 2026-08-10 khi chạy THẬT hai chiều trên `0003`: patch chiều trần có **26 file, 25 là
// rename của `BARE_STRIP`** — đúng MỘT file là việc agent làm. Nó phá đúng mục đích ㉙ ra đời
// để bảo vệ: PR #149 và #157 đều đến từ việc ĐỌC patch, và một patch 25/26 là nhiễu thì không
// ai đọc. Chế độ hỏng im lặng: patch VẪN có, VẪN áp lại được, chỉ là không đọc được.
{
  const p = writeTask('9033', NEUTRAL_155);
  const r = runEval(CMD, 'writes', '9033', { flags: ['--bare'], stateDir: join(WORK, 'state-patch-bare') });
  const m = r.out.match(/patch: (\S+)/);
  const patch = m ? (() => { try { return readFileSync(m[1], 'utf8'); } catch { return ''; } })() : '';
  const files = [...patch.matchAll(/^diff --git a\/(\S+)/gm)].map(x => x[1]);
  const noise = files.filter(f => /\.bare-disabled/.test(f) || patch.includes(`b/${f}.bare-disabled`));
  if (!m) {
    fail.push('㉙b chiều trần: agent SỬA CÂY mà runner không nêu tên patch');
  } else if (!/DÒNG DO AGENT GIẢ THÊM/.test(patch)) {
    fail.push('㉙b chiều trần: patch KHÔNG chứa thay đổi của agent — vá chống nhiễu đã cắt luôn cả tín hiệu');
  } else if (/bare-disabled/.test(patch)) {
    fail.push(`㉙b patch chiều trần chứa thao tác strip của \`--bare\` (${noise.length || 'nhiều'} mục) — đó là việc của RUNNER, không phải của agent; patch thành không đọc được đúng lúc nó có giá trị nhất`);
  } else {
    ok.push('㉙b patch chiều trần chỉ chứa việc AGENT làm — thao tác strip của `--bare` đã ra khỏi khung hình');
  }
  rmSync(p, { force: true });
}

// ── ㉙c Commit MỐC phải có ở CẢ HAI chiều — nếu không, bản vá ㉙b tự tạo lỗi #155 ──
//
// ㉙b buộc runner commit thao tác strip. Làm điều đó CHỈ ở chiều trần thì cây trần có 2 commit
// còn cây đầy đủ có 1 — hai chiều lại khác nhau ở một thứ NGOÀI `BARE_STRIP`, đúng lớp lỗi mà
// #155 và v2.54.0 vừa dọn, lần này do chính bản vá chống nhiễu sinh ra.
//
// Ca này không tự viết phép so: nó dùng chính máy dò mẫu số của v2.54.0. Assertion đòi
// `rev-list --count == 2`; lệch commit ⇒ đỏ ở đúng MỘT chiều ⇒ `n/a` ⇒ `ran` lệch ⇒ runner in
// "MẪU SỐ LỆCH". Nên phép kiểm ở đây là: **KHÔNG được có dòng đó**.
{
  const COUNT2 = `node -e "const c=require('child_process').execSync('git rev-list --count HEAD').toString().trim();process.exit(c==='2'?0:1)"`;
  const ST = join(WORK, 'state-moc');
  const p = writeTask('9034', COUNT2);
  runEval(CMD, 'ok', '9034', { flags: ['--baseline'], stateDir: ST });
  const r = runEval(CMD, 'ok', '9034', { flags: ['--bare'], stateDir: ST });
  if (/MẪU SỐ LỆCH/.test(r.out)) {
    fail.push('㉙c commit MỐC chỉ có ở một chiều — hai cây khác nhau ở SỐ COMMIT, ngoài `BARE_STRIP`. Bản vá chống nhiễu của ㉙b vừa tái tạo lỗi #155');
  } else if (!/đầy đủ \d+%\s+−\s+trần \d+%/.test(r.out)) {
    fail.push('㉙c hai chiều không so được vì lý do khác — neo của ca này đã trôi, đọc báo cáo trước khi sửa');
  } else {
    ok.push('㉙c commit mốc có ở CẢ HAI chiều ⇒ hai cây vẫn chỉ khác nhau ở `BARE_STRIP`');
  }
  rmSync(p, { force: true });
}

// ── ㉚ Tiền kiểm chạy ở CẢ HAI chiều, và nói đúng tên cây ────────────────────
//
// Hệ quả thứ hai của ㉗, và nó KHÔNG phải đối xứng cho đẹp. Cây đầy đủ nay là clone
// `--depth 1` **không remote**: một assertion đọc lịch sử git, đọc `origin`, hoặc đọc file
// chưa commit sẽ ĐỎ ở đây mà XANH trong repo người ta đang mở. Đó là hỏng do **chính bản vá
// #155 gây ra** — nếu để nó chấm thành FAIL thì #155 tự tạo ra một lớp FAIL giả.
//
// Vế thứ hai đắt ngang: thông điệp phải nói đúng **tên cây**. Câu "ĐỎ SẴN trên cây trần" ở
// chiều đầy đủ là một lời khai SAI, và nó gửi người đọc đi tìm nguyên nhân ở lớp harness
// trong khi nguyên nhân là hình dạng của cây.
{
  const ALWAYS_RED = 'node -e "process.exit(1)"';
  const p = writeTask('9022', `${NEUTRAL_155}\n${ALWAYS_RED}`);
  const r = runEval(CMD, 'ok', '9022');
  if (/→ fail/.test(r.out)) {
    fail.push('㉚ assertion ĐỎ TRƯỚC KHI agent chạy vẫn bị chấm FAIL ở chiều đầy đủ — tiền kiểm chỉ chạy một chiều, và cây clone tự sinh ra một lớp FAIL giả');
  } else if (!/ĐỎ SẴN trên cây đầy đủ/.test(r.out)) {
    fail.push('㉚ tiền kiểm ở chiều đầy đủ không nói đúng TÊN CÂY — "cây trần" ở đây là lời khai sai, nó gửi người đọc đi tìm ở lớp harness');
  } else if (!/REGRESSION\s+\d/.test(r.out)) {
    fail.push('㉚ tiền kiểm loại QUÁ TAY — task còn assertion trung lập chạy được thì vẫn phải ở trong mẫu số');
  } else {
    ok.push('㉚ tiền kiểm chạy ở CẢ chiều đầy đủ ⇒ assertion đỏ-sẵn là `n/a`, và câu giải thích nêu đúng tên cây');
  }
  rmSync(p, { force: true });
}

rmSync(WORK, { recursive: true, force: true });
report('EVAL RUNNER TESTS', { ok, warn, fail });
process.exit(fail.length ? 1 : 0);
