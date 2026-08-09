#!/usr/bin/env node
/**
 * MỘT runner cho MỌI gate.  Ba nơi gọi, một định nghĩa.
 *
 *   node tooling/gates.mjs --stage stop        ← Stop hook (gọi THẲNG, không qua hook trung gian)
 *   node tooling/gates.mjs --stage subagent    ← SubagentStop hook
 *   node tooling/gates.mjs --stage preMerge    ← /pre-merge VÀ ci.yml, cùng một lệnh
 *   node tooling/gates.mjs --list              ← "gate nào đang THẬT SỰ chạy?" — 30 giây
 *   node tooling/gates.mjs --list --timing     ← đo độ trễ, xem ngân sách bên dưới
 *
 * VÌ SAO FILE NÀY TỒN TẠI
 * Trước nó, `gates.preMerge` sống ở BA bản sao — config, skill `/pre-merge` dạng
 * văn xuôi, và CI. Ba bản sao của một danh sách là ba cơ hội để chúng lệch nhau,
 * và khi lệch thì bản được TIN là bản người đọc gần nhất, không phải bản đang chạy.
 * Giờ config là nguồn sự thật duy nhất và cả ba nơi cùng gọi một lệnh.
 *
 * ── NGÂN SÁCH ĐỘ TRỄ (đây là chỗ harness dễ làm GIẢM hiệu suất Claude Code nhất)
 *
 *   Stop        < 30 giây
 *   SubagentStop < 5 giây     ← nhân với tối đa 16 agent song song
 *
 * Đắt hơn thì ĐẨY XUỐNG CI. Một gate 40 giây ở Stop không bảo vệ thêm được gì so
 * với cùng gate đó ở CI — nó chỉ làm mỗi lượt của agent chậm đi 40 giây, và đó là
 * chi phí trả cho MỌI lượt, kể cả lượt không có gì để bắt.
 * Đo bằng `--list --timing`. Vượt ngưỡng → harness-doctor cảnh báo.
 *
 * ── TRẠNG THÁI THỨ BA
 * Gate chưa khai báo lệnh bị BỎ QUA và NÓI RA. Nó không phải pass, không phải fail:
 * nó là "harness không chạy". Một gate xanh mà một nửa bị bỏ qua thì KHÔNG phải xanh.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config, runConfigured, git, spill, telemetry, report, unattended, exists, repoPath, matchAny, pathsFor, repoRole, declaredCommands, TEST_TELEMETRY_DIR } from './lib/harness.mjs';

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const has = (name) => argv.includes(name);

const STAGE_BUDGET_MS = { stop: 30_000, subagent: 5_000, preMerge: Infinity };

/** Một gate = một tên lệnh trong `commands`, TRỪ các gate tổng hợp dưới đây. */
const COMPOSITE = {
  // Chạy `gen` rồi kiểm git sạch. Quên chạy gen sau khi sửa nguồn là lớp lỗi
  // im lặng nhất trong repo có code sinh: build vẫn xanh trên máy bạn vì output cũ
  // còn nằm đó, và vỡ ở CI hoặc ở máy người tiếp theo.
  'gen-clean': () => {
    // ĐO CÂY TRƯỚC KHI CHẠY GEN. Bản trước chỉ đo SAU, nên mọi cây bẩn đều bị gán một
    // nguyên nhân duy nhất: *"bạn quên chạy gen sau khi sửa nguồn"*. Câu đó đúng ở đúng
    // MỘT ca, và sai ở mọi ca còn lại.
    //
    // Đo được ở `sakubun`, HAI lần độc lập trong hai ngày (fixlog 08-04, đi lên qua
    // `upstream`): lần đầu cây bẩn vì một đợt nâng harness 2.7.5→2.7.9 nằm dở, lần sau vì
    // một SESSION SONG SONG đang áp template 2.8.x lúc 04:13:45. Cả hai lần gate nói người
    // dùng quên chạy `gen`, và cả hai lần họ đi tìm ở generator — chỗ không có gì sai.
    //
    // Một chẩn đoán sai đắt hơn không chẩn đoán: nó gửi người ta đi sai hướng với sự tự tin
    // của một cái máy. Nên phép so đúng là DELTA — chỉ những file mà CHÍNH `gen` làm bẩn
    // mới chứng minh được "quên chạy gen".
    const dirtySet = () => new Set(
      git(['status', '--porcelain', '--untracked-files=no']).stdout.split('\n').filter(Boolean)
        .map(l => l.slice(3).trim()));
    const before = dirtySet();

    const gen = runConfigured('gen', { capture: true });
    if (gen.skipped) return { skipped: true, why: 'chưa khai báo commands.gen' };
    if (gen.status !== 0) return { status: 1, detail: `lệnh gen fail (${spill('gen', gen.stdout + gen.stderr)})` };

    const after = dirtySet();
    const byGen = [...after].filter(f => !before.has(f));
    if (byGen.length) {
      return { status: 1, detail: `chạy gen xong ${byGen.length} file ĐỔI: ${byGen.slice(0, 5).join(' · ')}`
        + `${byGen.length > 5 ? ` … +${byGen.length - 5}` : ''} → bạn quên chạy gen sau khi sửa nguồn` };
    }
    if (!before.size) return { status: 0 };

    // `gen` không đổi gì ⇒ output sinh ĐANG đúng, tức mục đích của gate này ĐẠT. Cây bẩn
    // vì việc khác, và việc khác không phải phạm vi của gate này — nhưng im lặng thì lần
    // sau lại là một chẩn đoán bịa ra. Nên: pass, kèm câu NÓI ĐÚNG cái đang thấy.
    const layer = (f) => (matchAny(f, pathsFor('harness')) ? 'harness' : matchAny(f, pathsFor('generated')) ? 'generated' : 'khác');
    const groups = {};
    for (const f of before) (groups[layer(f)] ??= []).push(f);
    const desc = Object.entries(groups).map(([k, v]) => `${v.length} ${k}`).join(' · ');
    return { status: 0, note: `gen KHÔNG đổi gì (output sinh đang đúng) nhưng cây đã bẩn TỪ TRƯỚC: ${desc}.`
      + (groups.harness ? ' Lớp `harness` bẩn thường là một đợt nâng cấp nằm dở, hoặc một SESSION SONG SONG đang áp template — kiểm `git log --oneline -3` và `git status` trước khi kết luận.' : '')
      + ' Đây KHÔNG phải "quên chạy gen".' };
  },
};

function runGate(name) {
  const t0 = Date.now();
  const composite = COMPOSITE[name];
  const r = composite ? composite() : runConfigured(name, { capture: true });
  const ms = Date.now() - t0;
  if (r.skipped) return { name, state: 'skip', ms, why: r.why ?? `chưa khai báo commands.${name}` };
  if (r.status !== 0) {
    const detail = r.detail ?? `FAIL → ${spill(name, (r.stdout || '') + '\n' + (r.stderr || ''))}`;
    return { name, state: 'fail', ms, detail };
  }
  return { name, state: 'pass', ms, note: r.note };
}

/**
 * CHI PHÍ SÀN của chính runner này ở một stage KHÔNG gate nào có lệnh: một tiến trình Node,
 * một lần nạp config, một vòng lặp qua danh sách gate, một lần ghi telemetry. Trả đủ, mỗi
 * lần hook kích hoạt, kể cả khi nó không làm gì.
 *
 * ĐO ĐÚNG LỆNH THẬT (`--stage <stage>`), không đo một probe rút gọn. Bản đầu tôi viết một
 * `--floor-probe` thoát ngay sau khi nạp module: nó cho 64ms trong khi lần gọi thật tốn
 * 104ms — **báo thấp hơn thực tế 40%**, đúng cái sai mà chính bản vá này ra đời để sửa.
 *
 * TELEMETRY CHUYỂN HƯỚNG sang thư mục test: phép đo phải chạy 5 lần, và 5 dòng giả trong
 * `gate-runs.log` là công cụ đo tự làm nhiễu số của chính nó (issue #66, sửa ở v2.25.0).
 *
 * Chỉ gọi ở nhánh `!ran` — nơi đã biết chắc không gate nào có lệnh, nên không có gì để chạy
 * và không có tác dụng phụ nào ngoài telemetry.
 *
 * Đo trực tiếp thay vì hằng số cứng: một con số viết cứng sẽ sai ở máy chậm hơn đúng vào lúc
 * nó quan trọng nhất. Trung vị 5 lần, không phải trung bình — lần đầu hay dính cache lạnh,
 * và một outlier kéo trung bình đi trong khi cái cần biết là "bình thường tốn bao nhiêu".
 */
function floorMs(stage) {
  const t = [];
  for (let i = 0; i < 5; i++) {
    const a = Date.now();
    spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--stage', stage],
      { stdio: 'ignore', env: { ...process.env, HARNESS_TELEMETRY_DIR: TEST_TELEMETRY_DIR } });
    t.push(Date.now() - a);
  }
  return t.sort((x, y) => x - y)[2];
}

// ── --list : gate nào đang THẬT SỰ chạy ──────────────────────────────────────
if (has('--list')) {
  const cfg = config().gates ?? {};
  const timing = has('--timing');
  const ok = [], warn = [], na = [], unknown = [];
  for (const [stage, names] of Object.entries(cfg)) {
    if (!Array.isArray(names)) continue;
    let total = 0, ran = 0;
    for (const n of names) {
      const declared = COMPOSITE[n] || String(config().commands?.[n] ?? '').trim();
      if (!declared) { na.push(`${stage}/${n}: KHÔNG có lệnh → gate này không tồn tại, dù nó nằm trong config`); continue; }
      if (!timing) { ok.push(`${stage}/${n}`); continue; }
      const r = runGate(n);
      total += r.ms;
      ran++;
      ok.push(`${stage}/${n}: ${r.ms}ms (${r.state})`);
    }
    if (timing) {
      const budget = STAGE_BUDGET_MS[stage] ?? Infinity;
      // `0ms` khi KHÔNG gate nào chạy được nghĩa là "không có gì chạy", không phải "nhanh".
      // Báo `OK stage: tổng 0ms / ngân sách 30000ms` cho một stage mà mọi gate đều `n/a`
      // là chính phép gộp `0` với `n/a` mà file này cấm ở §TRẠNG THÁI THỨ BA — và nó nói
      // dối đúng hướng dễ chịu: nó bảo "harness không cản gì cả".
      if (!ran) {
        // "Không gate nào có lệnh" KHÔNG phải "không có gì chạy". CHÍNH FILE NÀY chạy: mỗi
        // stage là một lời gọi `node tooling/gates.mjs` từ hook, và một tiến trình Node cộng
        // một lần nạp config là chi phí SÀN — trả đủ, mỗi lần, kể cả khi nó không làm gì.
        //
        // Đo 2026-08-07, trung vị 7 lần: 104ms. Ở `subagent` con số đó nhân với số agent
        // song song, và Claude Code 2.1.224 vừa **bỏ trần 200 subagent mỗi phiên** — trần
        // của vendor từng che cho ta, giờ không còn.
        //
        // Bản trước gọi cả cụm này là "KHÔNG đo được". Đúng về phần VIỆC của gate, sai về
        // CHI PHÍ — và nó sai theo hướng dễ chịu, đúng lớp lỗi mà §TRẠNG THÁI THỨ BA của
        // file này cấm. Hai con số, hai câu khác nhau: sàn ĐO ĐƯỢC, việc thật thì CHƯA.
        na.push(`${stage}: sàn runner ${floorMs(stage)}ms mỗi lần gọi — trả kể cả khi 0/${names.length} gate có lệnh`
          + (stage === 'subagent' ? ` (×N agent song song; Claude Code 2.1.224 đã bỏ trần 200)` : '')
          + `. Phần VIỆC của gate thì CHƯA đo được — hai chuyện khác nhau, đừng đọc \`0ms\` thành "nhanh"`);
      }
      else if (total > budget) warn.push(`${stage}: ${total}ms VƯỢT ngân sách ${budget}ms — đẩy gate đắt xuống CI. Ở subagent, con số này nhân với tối đa 16 agent song song.`);
      else if (budget !== Infinity) ok.push(`${stage}: tổng ${total}ms / ngân sách ${budget}ms (${ran}/${names.length} gate có lệnh)`);
    }
  }
  if (!timing) unknown.push('độ trễ CHƯA ĐO — chạy `--list --timing`. Không có số này thì "harness có đang cản không" là câu chưa trả lời được.');
  report('GATES', { ok, warn, na, unknown });
  process.exit(0);
}

// ── --stage : chạy thật ──────────────────────────────────────────────────────
const stage = arg('--stage') ?? 'stop';
const gates = config().gates?.[stage] ?? [];
if (!gates.length) process.exit(0);

const ok = [], warn = [], fail = [];
// ĐẾM RIÊNG số gate BỊ BỎ QUA. Nhánh fail-đóng ở cuối file khoá vào "gate bị bỏ qua", nhưng
// bản trước kiểm `warn.length` — hai thứ khác nhau, và chúng đã lệch: cảnh báo VƯỢT NGÂN SÁCH
// độ trễ cũng đi vào `warn`, nên một phiên không người chỉ CHẬM (mọi gate PASS) vẫn exit 2 với
// thông báo nói rằng gate bị bỏ qua. Đó là fail-đóng bắn nhầm — và nó dạy đúng thứ tệ nhất:
// đặt `HARNESS_ALLOW_SKIPPED_GATES=1` để cho qua, tức tắt lớp bảo vệ vì một lý do không liên quan.
let skipped = 0;
let totalMs = 0;
for (const name of gates) {
  const r = runGate(name);
  totalMs += r.ms;
  if (r.state === 'skip') { warn.push(`${name}: ${r.why} — BỎ QUA (đây không phải pass)`); skipped++; }
  else if (r.state === 'fail') { fail.push(`${name}: ${r.detail}`); telemetry('gate-fails', [`gates:${stage}`, name]); }
  else { ok.push(`${name} (${r.ms}ms)`); if (r.note) warn.push(`${name}: ${r.note}`); }
}

const budget = STAGE_BUDGET_MS[stage] ?? Infinity;
if (totalMs > budget) warn.push(`độ trễ ${totalMs}ms vượt ngân sách ${budget}ms cho stage \`${stage}\` — đẩy gate đắt xuống CI`);

// ── GHI LẠI RẰNG STAGE NÀY ĐÃ CHẠY — kể cả khi nó xanh ──────────────────────
//
// Trước đây `gates.mjs` chỉ ghi telemetry khi HỎNG. Hệ quả: không tồn tại dấu vết nào của
// một lần chạy thành công, nên nghi thức `/pre-merge` — vốn in đúng câu *"chưa thấy dấu gate
// preMerge chạy ở phiên này"* — **không đi tìm dấu nào cả**, vì không có gì để tìm. Nó đỏ
// theo `ahead > 0` và ở đỏ mãi, chạy gate bao nhiêu lần cũng vậy, kèm một lý do mô tả một
// phép đo chưa từng xảy ra.
//
// Đây đúng ba trạng thái mà `hookRan()` đã tách ra cho hook, chỉ là gate chưa được hưởng:
// gate chạy suốt và luôn xanh · gate chưa từng chạy · gate chạy hỏng. Không có dòng này thì
// cả ba đọc giống hệt nhau — và cái ở giữa là cái nguy hiểm.
//
// `skipped` đi kèm vì "xanh" và "xanh vì không có gì để chạy" là hai chuyện khác nhau, và
// người đọc nghi thức cần phân biệt được mà không phải mở log ra.
telemetry('gate-runs', [`gates:${stage}`, fail.length ? 'fail' : 'pass', `ok=${ok.length} skip=${skipped} ms=${totalMs}`]);

report(`GATES · ${stage}`, { ok, warn, fail });

if (fail.length) {
  console.error(`Gate \`${stage}\` ĐỎ. Sửa các dòng FAIL ở trên.`);
  console.error('Nếu bạn tin gate sai: KHÔNG tắt hook — chạy /harness-propose.');
  process.exit(2);
}

// ── REPO TEMPLATE: điều kiện của gác này KHÔNG THỂ THOẢ ─────────────────────
//
// Gác dưới đây bảo *"khai đủ lệnh trong harness.config.json"*. Ở repo TEMPLATE lời khuyên đó
// **bất khả thi**: `setup.mjs` TỪ CHỐI `--apply` ở đây, bằng chính lý do đúng — *"ghi cấu hình
// thật vào đây sẽ biến placeholder của template thành cấu hình của MỘT project, và mọi project
// áp sau đó thừa hưởng nó"*. `commands` rỗng là trạng thái ĐÚNG và VĨNH VIỄN của template.
//
// Nên ở template, gác này chỉ còn đúng MỘT lối ra: đi vòng bằng `HARNESS_ALLOW_SKIPPED_GATES`.
// Đó đúng tiêu chí mà nghi thức `guard-nhanh-tich-hop` dùng để đề nghị CẮT một cái gác:
// *"cửa thoát dùng nhiều hơn được tuân theo là một guard đang dạy người ta đi vòng"*.
//
// Và cái giá không phải lý thuyết. Đo 2026-08-09 (#145): `claude -p` đặt
// `CLAUDE_CODE_ENTRYPOINT=sdk-cli` ⇒ `unattended()` ⇒ mọi lượt Stop exit 2 ⇒ Claude Code
// re-invoke agent ⇒ Stop lại đỏ. **Không có điều kiện hội tụ.** Một prompt tầm thường
// ("trả lời hai chữ OK") cũng chạm `max turns`, và mỗi lượt tốn token thật. Nó chặn eval
// runner, scheduled agent, canary — mọi thứ chạy không có người, ở đúng repo mà lớp eval
// phải chạy để chứng minh harness có giá trị.
//
// PHẠM VI HẸP, CỐ Ý. Ba điều kiện phải cùng đúng, và điều kiện giữa là điều kiện quan trọng:
//   · `repoRole() === 'template'`  — repo tiêu thụ có `.claude/harness-manifest.json` ⇒ KHÔNG
//     rơi vào đây, và với họ `commands` rỗng đúng là cấu hình sai cần chặn.
//   · `declaredCommands().length === 0` — khai được MỘT lệnh nghĩa là khai được nhiều hơn.
//     Template khai 1/3 rồi bỏ 2 thì gác cũ vẫn áp: đó là thiếu sót, không phải cấu trúc.
//   · `skipped && unattended()` — như cũ.
const noCommandsHere = declaredCommands(config()).length === 0;
const templateCannotComply = repoRole() === 'template' && noCommandsHere;

// Phiên KHÔNG có người ngồi xem thì một gate bị bỏ qua là rủi ro thật, không phải
// một dòng cảnh báo ai đó sẽ đọc. Không ai đọc. Fail đóng, đừng fail mở.
if (skipped && unattended() && !templateCannotComply && process.env.HARNESS_ALLOW_SKIPPED_GATES !== '1') {
  console.error(`\n⛔ Phiên KHÔNG có người ngồi xem và ${skipped} gate bị BỎ QUA.`);
  console.error('   Ở phiên có người, dòng cảnh báo là đủ — có người đọc nó. Ở đây thì không.');
  console.error('   Khai đủ lệnh trong harness.config.json, hoặc đặt HARNESS_ALLOW_SKIPPED_GATES=1 nếu đây là chủ ý.');
  process.exit(2);
}

// CHO QUA, NHƯNG NÓI RA. Im lặng ở đây biến một ca "không thể thoả" thành một ca "đã thoả",
// và đó đúng phép gộp mà cả file này tồn tại để chống. Dòng này in ở stderr của MỌI lượt Stop
// headless trong template — nó phải ngắn, và nó phải nói ra rằng KHÔNG CÓ GÌ ĐƯỢC KIỂM.
if (skipped && unattended() && templateCannotComply) {
  console.error(`\n⚠️  REPO TEMPLATE, phiên không người: ${skipped} gate bị BỎ QUA và KHÔNG có gì được kiểm.`);
  console.error('   KHÔNG chặn — `commands` rỗng là trạng thái ĐÚNG của template (`setup.mjs` từ chối --apply ở đây),');
  console.error('   nên chặn ở đây là một gác không có đường thoả, và nó làm phiên headless lặp vô hạn (#145).');
  console.error('   Ở repo TIÊU THỤ, cùng tình huống này VẪN CHẶN — ở đó `commands` rỗng là cấu hình sai.');
}
process.exit(0);
