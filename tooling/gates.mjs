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
import { config, runConfigured, git, spill, telemetry, report, unattended, exists, repoPath, matchAny, pathsFor } from './lib/harness.mjs';

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
      if (!ran) na.push(`${stage}: KHÔNG đo được độ trễ — 0/${names.length} gate có lệnh. \`0ms\` ở đây là "không có gì chạy", không phải "nhanh"`);
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

report(`GATES · ${stage}`, { ok, warn, fail });

if (fail.length) {
  console.error(`Gate \`${stage}\` ĐỎ. Sửa các dòng FAIL ở trên.`);
  console.error('Nếu bạn tin gate sai: KHÔNG tắt hook — chạy /harness-propose.');
  process.exit(2);
}

// Phiên KHÔNG có người ngồi xem thì một gate bị bỏ qua là rủi ro thật, không phải
// một dòng cảnh báo ai đó sẽ đọc. Không ai đọc. Fail đóng, đừng fail mở.
if (skipped && unattended() && process.env.HARNESS_ALLOW_SKIPPED_GATES !== '1') {
  console.error(`\n⛔ Phiên KHÔNG có người ngồi xem và ${skipped} gate bị BỎ QUA.`);
  console.error('   Ở phiên có người, dòng cảnh báo là đủ — có người đọc nó. Ở đây thì không.');
  console.error('   Khai đủ lệnh trong harness.config.json, hoặc đặt HARNESS_ALLOW_SKIPPED_GATES=1 nếu đây là chủ ý.');
  process.exit(2);
}
process.exit(0);
