#!/usr/bin/env node
/**
 * Kiểm HÀM THUẦN của `tooling/lib/harness.mjs` — tách khỏi `test-hooks.mjs` ở v2.80.0.
 *
 *   node tooling/test-lib.mjs
 *
 * ── VÌ SAO TÁCH, và vì sao file NÀY không ship
 *
 * `test-hooks.mjs` ship xuống mọi repo tiêu thụ (`MECHANISM_PATHS`), và nó đã lên 5 654 dòng —
 * **19 % toàn bộ dấu chân harness** ở project đích. Nhưng hai nửa của nó phục vụ hai người khác
 * nhau:
 *
 *   · HÀNH VI CỦA GÁC (hook chặn đúng chưa, gác hỏng có fail-đóng không, dcg ↔ permissions.deny)
 *     — repo tiêu thụ CẦN, vì đó là bản sao CỦA HỌ đang chạy, và họ sửa được `settings.json`.
 *   · HÀM THUẦN CỦA LIB (`budgetStatus`, `parseFlags`, `stuckRituals`, …) — repo tiêu thụ
 *     KHÔNG bao giờ sửa `lib`; nó đến từ template và được CI của template kiểm. Bắt họ mang
 *     theo 1 558 dòng test cho code họ không đụng tới là thuế thuần.
 *
 * Nên file này ở lại template (`NOT_FOR_CONSUMER`), và `test-hooks.mjs` giữ nguyên TÊN — vì bốn
 * eval task đang ship khẳng định `node tooling/test-hooks.mjs` chạy xanh. Đổi tên file đó là
 * làm đỏ bộ eval của mọi consumer.
 *
 * SÀN RIÊNG, cùng lý do với sàn của `test-hooks`: một ca ngừng chạy phải nhìn thấy được.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, mkdtempSync, rmSync, readdirSync, cpSync, mkdirSync, unlinkSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { repoPath, report, exists, git, run, tmpdir, repoRole, readJson, TEST_TELEMETRY_DIR, TEST_STATE_DIR, TEST_RUN_ID, testRunPath, sweepStaleTestRuns, isRecordedRemoval, removedSkillNames, declaredCommands, tallyLines, inferIssue, devId, MECHANISM_PATHS, NOT_FOR_CONSUMER, fixlogKey, groupStillClosed, groupTracked, coordinationLayer, verificationCoverage, PACK_SCHEMA, packPending, packMaterial, budgetStatus, budgetPlan, dangerousCommand, infraFailure, budgetExhausted, agentEnvelope, envelopeBudget, mergeState, codeOnly, openTelemetryEntries, closeTelemetry, TELEMETRY_CLOSED, resolveSharedState, configCoverageOf, configCoverage, harnessStripped, flatCapoReading, releaseTagGap, handledGroups, mergeRitualStates, stuckRituals, GIT_DISCARD_WHOLE_TREE, backtickEvalHazard, backtickSubstitution, verdictLine, emitVerdict, codeScanDesync, frictionReading, slotCounters, backtickEvalHazardIn, contextLossPending, selfPraiseClaims, promoteDeclined, parseFlags, guardFlags } from './lib/harness.mjs';
import { pickEventArray, pickFrontmatterKeys, normKey, nativeHookEvents, SCAN } from './native-surface.mjs';

const TEST_ENV = {
  // MỌI CỬA THOÁT PHẢI ĐÓNG. Suite này assert LOGIC của hook, nên nó phải kiểm soát
  // môi trường, không được thừa hưởng môi trường của người đang chạy nó. Chính DRI là
  // người hay chạy suite nhất, và DRI là người duy nhất có `HARNESS_DRI=1` trong env —
  // nên nếu không xoá ở đây thì mọi case "agent KHÔNG tự sửa harness" chuyển sang xanh-giả
  // ĐÚNG TRÊN MÁY CỦA NGƯỜI DUY NHẤT sửa được hook. Case nào cần cửa thoát thì tự khai
  // trong `env` của nó (spread SAU TEST_ENV nên nó thắng).
  HARNESS_DRI: '',
  HARNESS_ALLOW_MIGRATION_EDIT: '',
  HARNESS_ALLOW_SKIPPED_GATES: '',
  // Cửa thoát của `declareFailMode`. Không xoá ở đây thì mọi ca "gác ném lỗi phải CHẶN"
  // chuyển sang xanh-giả trên máy của người đang phải mở cửa thoát đó để đi tiếp — tức là
  // đúng lúc suite cần nói thật nhất.
  HARNESS_FAIL_OPEN: '',
  // Hằng số ở `lib`, KHÔNG viết tay ở đây: `harness-doctor` ĐỌC đúng thư mục này như nguồn
  // bằng chứng thứ hai ("hook có chạy được không, hay crash im lặng?"). Hai chuỗi viết tay
  // lệch nhau thì doctor đọc thư mục rỗng và kết luận sai về hook vừa chạy xong.
  HARNESS_TELEMETRY_DIR: TEST_TELEMETRY_DIR,
  // Không có dòng này, mỗi lần chạy suite sẽ ăn mất thông báo `.claude/whats-new.md` của chính
  // bạn: cơ chế đó cố ý chỉ in MỘT LẦN cho mỗi version, nên "đã in rồi" là trạng thái
  // không lấy lại được. Test không được phép tiêu thụ trạng thái thật của người dùng.
  HARNESS_STATE_DIR: TEST_STATE_DIR,
};

const ok = [], fail = [];
const naEntries = [];
const declareNa = (count, msg) => naEntries.push({ count, msg });


// ─── L0008: một tín hiệu TỚI HẠN phải TẮT ĐƯỢC bằng hành động nó đề nghị ─────
//
// Bốn lần trong hai tuần (W32 §1 · #174 · #181 · #183). Cơ chế ĐO chứ không bắt KHAI: `rituals`
// ghi trạng thái mỗi lượt, `harness-doctor` hỏi *"mục nào đỏ ≥14 ngày mà chưa lần nào xanh?"*.
//
// Bảng dưới canh CHIỀU IM LẶNG của nó: một sổ tự đặt lại `since` mỗi lượt vẫn chạy, vẫn ghi
// file, vẫn có dữ liệu — và cảnh báo KHÔNG BAO GIỜ nổ. Không triệu chứng nào ngoài ca test.
{
  const L8 = ' '.repeat(9);
  const bad = [];
  const T0 = Date.parse('2026-08-12T00:00:00.000Z');
  const T = (d) => new Date(T0 + d * 86400000).toISOString();

  // ① Trạng thái KHÔNG ĐỔI ⇒ `since` GIỮ NGUYÊN. Đặt lại mỗi lượt ⇒ `dueDays` luôn 0.
  const r1 = mergeRitualStates(null, [{ id: 'a', state: 'due' }], T(-20));
  const r2 = mergeRitualStates(r1, [{ id: 'a', state: 'due' }], T(0));
  if (r2.rituals.a.since !== T(-20)) bad.push('trạng thái KHÔNG đổi mà `since` bị đặt lại — quãng đỏ luôn bằng 0, cảnh báo không bao giờ nổ');
  if (r2.firstRunAt !== T(-20)) bad.push('`firstRunAt` bị ghi đè — quãng quan sát co về 0 và sổ mãi ở `warming`');
  if (r2.lastRunAt !== T(0) || r2.runs !== 2) bad.push('`lastRunAt`/`runs` không tiến theo lượt đo');

  // ② Trạng thái ĐỔI ⇒ `since` PHẢI đặt lại. Chiều ngược của ①, và nó nổ NHẦM (`L0002`).
  const r3 = mergeRitualStates(r2, [{ id: 'a', state: 'ok' }], T(1));
  if (r3.rituals.a.since !== T(1)) bad.push('trạng thái ĐỔI mà `since` không đặt lại — mục xanh rồi đỏ lại bị tính là đỏ suốt');
  if (r3.rituals.a.lastOkAt !== T(1) || r3.rituals.a.okRuns !== 1) bad.push('lượt `ok` không được ghi — mọi mục sẽ trông như chưa từng xanh');

  // ③ Lượt đo RỖNG ⇒ không ghi gì. Bơm `lastRunAt` cho một lượt không thấy gì là sổ tự khai
  //    "tôi vẫn đang nhìn", và đó là thứ duy nhất phân biệt `stale` với dữ liệu thật.
  if (mergeRitualStates(r3, [], T(2)) !== r3) bad.push('lượt đo RỖNG vẫn ghi — sổ tự khai đang nhìn trong khi không thấy gì');
  if (mergeRitualStates(r3, null, T(2)) !== r3) bad.push('`results` không phải mảng vẫn ghi');

  // ④ Nghi thức bị XOÁ khỏi `RITUALS` mang theo dòng của nó — nếu không, sổ giữ một mục kẹt
  //    vĩnh viễn về thứ không còn tồn tại, đúng bệnh cơ chế này đi chữa.
  const r4 = mergeRitualStates(r3, [{ id: 'b', state: 'ok' }], T(2));
  if (r4.rituals.a) bad.push('nghi thức đã xoá vẫn nằm trong sổ — một mục kẹt vĩnh viễn về thứ không còn tồn tại');

  // ⑤ Bảng phán quyết. `mode` mang kết luận; ba mode "chưa trả lời được" KHÔNG được trả `[]`.
  const rit = (state, sinceD, okRuns = 0) => ({ state, since: T(sinceD), lastOkAt: okRuns ? T(sinceD) : null, okRuns, runs: 40 });
  const snap = (over) => ({ firstRunAt: T(-40), lastRunAt: T(0), runs: 40, rituals: {}, ...over });
  const SR = [
    [null, 'unmeasured', 'chưa có sổ'],
    [{ lastRunAt: T(0) }, 'unmeasured', 'sổ không có khoá `rituals`'],
    [snap({ firstRunAt: T(0) }), 'warming', 'quãng quan sát 0 ngày < 14'],
    [snap({ firstRunAt: T(-60), lastRunAt: T(-20) }), 'stale', 'lượt ghi cuối 20 ngày trước ⇒ cửa sổ nằm hẳn trong quá khứ'],
    [snap({ lastRunAt: T(3) }), 'stale', 'mốc ghi ở TƯƠNG LAI ⇒ phép so không còn nghĩa'],
    [snap({ rituals: { x: rit('due', -20) } }), 'stuck', 'đỏ 20 ngày, 0 lần xanh'],
    [snap({ rituals: { x: rit('due', -20, 5) } }), 'pending', 'đỏ 20 ngày NHƯNG đã từng xanh ⇒ việc tồn, không phải tín hiệu hỏng'],
    [snap({ rituals: { x: rit('due', -3) } }), 'ok', 'đỏ 3 ngày — dưới cửa sổ'],
    [snap({ rituals: { x: rit('ok', -40) } }), 'ok', 'xanh suốt'],
    [snap({ rituals: { x: { state: 'due', since: 'khong-phai-mot-ngay' } } }), 'ok', 'mốc hỏng ⇒ bỏ qua dòng đó, không crash và không bịa'],
  ];
  for (const [s, want, label] of SR) {
    const got = stuckRituals(s, { now: T0 }).mode;
    if (got !== want) bad.push(`mode \`${got}\` ≠ \`${want}\` — ${label}`);
  }

  // ⑥ `dueDays` đo từ `lastRunAt`, KHÔNG từ `now`. Ca này là ca DUY NHẤT phân biệt hai phép
  //    tính: ngừng chạy `rituals` 10 ngày thì con số phải ĐỨNG YÊN ở 8 ngày đã quan sát, không
  //    lớn lên thành 18. Cùng lý do `tallyLines()` có `sinceMs` — bằng chứng cũ đọc thành bằng
  //    chứng hôm nay là cách một bảng nói "ổn" trong khi nó chưa nhìn.
  const observed = stuckRituals(snap({ lastRunAt: T(-10), rituals: { x: rit('due', -18) } }), { now: T0 });
  if (observed.mode !== 'ok') {
    bad.push(`quãng đỏ tính từ HÔM NAY thay vì từ lượt ghi cuối (mode \`${observed.mode}\`) — 8 ngày đã quan sát bị đọc thành 18`);
  }

  // ⑦ `null` ≠ `[]`. `[]` là câu "đã nhìn, không có mục nào"; với sổ mới một ngày thì đó là lời
  //    khai sai, và nó sai theo chiều dễ chịu (`L0005`).
  for (const [s, m] of [[null, 'unmeasured'], [snap({ firstRunAt: T(0) }), 'warming'], [snap({ firstRunAt: T(-60), lastRunAt: T(-20) }), 'stale']]) {
    if (stuckRituals(s, { now: T0 }).stuck !== null) bad.push(`mode \`${m}\` trả \`[]\` thay vì \`null\` — "đã nhìn, không có gì" ≠ "chưa nhìn"`);
  }
  if (!Array.isArray(stuckRituals(snap({ rituals: { x: rit('ok', -40) } }), { now: T0 }).stuck)) {
    bad.push('mode `ok` phải trả MẢNG rỗng — ở đó phép đo ĐÃ chạy, và `null` sẽ nói dối theo chiều ngược lại');
  }

  // ⑧ HỢP ĐỒNG mode ↔ bên đọc. Thiếu một dòng ⇒ doctor in `undefined`, và `undefined` trên một
  //    bảng sức khoẻ đọc y hệt "không có gì để nói". Cùng khuôn với `MODES` của `budgetStatus`,
  //    và neo vào ĐÚNG khối (`const sr = stuckRituals` … `LINE[sr.mode]`), không quét cả file.
  const MODES8 = ['unmeasured', 'warming', 'stale', 'stuck', 'pending', 'ok'];
  const docSrc = readFileSync(repoPath('tooling', 'harness-doctor.mjs'), 'utf8');
  const block8 = docSrc.match(/const sr = stuckRituals[\s\S]*?LINE\[sr\.mode\]/)?.[0] ?? '';
  if (!block8) bad.push('không tìm thấy khối đọc `stuckRituals` trong harness-doctor.mjs — cơ chế có sổ mà không có bên đọc');
  else {
    const miss8 = MODES8.filter(m => !new RegExp(`^\\s+'?${m}'?:`, 'm').test(block8));
    if (miss8.length) bad.push(`harness-doctor thiếu dòng cho mode: ${miss8.join(' · ')} — sẽ in \`undefined\``);
  }
  // Và chiều ngược: mode khai trong bảng trên phải THẬT SỰ được hàm sinh ra. Một mode chết nằm
  // trong hợp đồng làm hợp đồng đó thôi có nghĩa.
  const fn8 = codeOnly(readFileSync(repoPath('tooling', 'lib', 'harness.mjs'), 'utf8'))
    .match(/export function stuckRituals[\s\S]*?\n}/)?.[0] ?? '';
  const dead8 = MODES8.filter(m => !fn8.includes(`'${m}'`));
  if (dead8.length) bad.push(`mode khai ở hợp đồng nhưng \`stuckRituals\` không bao giờ trả: ${dead8.join(' · ')}`);

  // ⑨ ĐẦU-CUỐI: `rituals` có THẬT SỰ ghi sổ không, và ghi ở đường nào. Sổ riêng trong `tmpdir`.
  //    Chỗ dễ hỏng nhất không phải phép hợp nhất mà là CHỖ GỌI: `session-start` import
  //    `collect()`/`evaluate()` chứ không spawn CLI, nên một lời gọi đặt trong `main()` sẽ chỉ
  //    ghi những lượt chạy TAY — cơ chế vẫn "chạy", vẫn có file, và vẫn đo sai quần thể.
  const t8 = mkdtempSync(join(tmpdir(), 'harness-ledger-'));
  const runRit = () => spawnSync(process.execPath, [repoPath('tooling', 'rituals.mjs'), '--json'],
    { encoding: 'utf8', cwd: repoPath(), env: { ...process.env, HARNESS_STATE_DIR: t8, HARNESS_TELEMETRY_DIR: t8 } });
  runRit();
  const led1 = readJson(join(t8, 'ritual-states.json'), null);
  if (!led1 || !led1.rituals) bad.push('`rituals` chạy xong mà KHÔNG có sổ trạng thái — cơ chế không được cắm vào đường chạy thật');
  else {
    if (Object.keys(led1.rituals).length < 10) bad.push(`sổ chỉ ghi ${Object.keys(led1.rituals).length} nghi thức — bảng có 14`);
    runRit();
    const led2 = readJson(join(t8, 'ritual-states.json'), null);
    if (led2?.runs !== 2) bad.push(`lượt thứ hai không được cộng vào sổ (runs = ${led2?.runs})`);
    const moved = Object.keys(led1.rituals).filter(k => led2?.rituals?.[k]?.state === led1.rituals[k].state
      && led2.rituals[k].since !== led1.rituals[k].since);
    if (moved.length) bad.push(`${moved.length} nghi thức giữ nguyên trạng thái mà \`since\` vẫn nhảy: ${moved.slice(0, 3).join(' · ')}`);
  }

  // ⑩ CẮT BỎ của lô này, đo đầu-cuối: ngưỡng `≥10/tuần` của `fixlog --list` đặt trên số CHƯA
  //    XỬ. Đo trên sổ thật 2026-08-12 trước khi cắt: cảnh báo bật với 11 mục, thật sự chưa xử 2.
  const now = Date.now();
  const day = (d, txt) => `${new Date(now - d * 86400000).toISOString()}|fixture|main|${txt}\n`;
  let log = '';
  for (let i = 0; i < 12; i++) log += day(1, 'mot nhom loi lap lai rat nhieu lan trong tuan nay');
  log += day(2, 'mot loi hoan toan khac khong lien quan gi ca');
  writeFileSync(join(t8, 'manual-fixes.log'), log, 'utf8');
  const runList = () => spawnSync(process.execPath, [repoPath('tooling', 'fixlog.mjs'), '--list'],
    { encoding: 'utf8', cwd: repoPath(), env: { ...process.env, HARNESS_TELEMETRY_DIR: t8 } }).stdout || '';
  const l1 = runList();
  if (!/⚠️/.test(l1)) bad.push('13 mục CHƯA XỬ trong 7 ngày mà `--list` không cảnh báo — phép cắt đã cắt cả tín hiệu thật');
  spawnSync(process.execPath, [repoPath('tooling', 'fixlog.mjs'), '--track', 'mot nhom loi lap lai', '#999 — chờ upstream'],
    { encoding: 'utf8', cwd: repoPath(), env: { ...process.env, HARNESS_TELEMETRY_DIR: t8 } });
  const l2 = runList();
  if (/⚠️/.test(l2)) bad.push('nhóm đã có ĐỊA CHỈ vẫn tính vào ngưỡng ≥10 — cảnh báo bật cho một backlog đã xử');
  if (!/13 — 1 CHƯA XỬ/.test(l2)) bad.push(`\`--list\` không nói ra mẫu số thật (được: "${(l2.split('\n')[1] || '').slice(0, 44)}")`);
  if (!/^· /m.test(l2)) bad.push('mục đã xử không mang dấu `·` — người đọc không đối chiếu được 13 với 1');
  rmSync(t8, { recursive: true, force: true });

  if (bad.length) fail.push(`stuckRituals${L8} ${bad.length} ca sai: ${bad.join(' | ')}`);
  else ok.push(`stuckRituals${L8} sổ trạng thái nghi thức: \`since\` chỉ nhảy khi trạng thái đổi · quãng đỏ đo từ lượt ghi CUỐI · `
    + `${MODES8.length} mode đều có bên đọc · ngưỡng fixlog --list đặt trên số CHƯA XỬ`);
}

// ─── LỚP PHỐI HỢP: `chưa khai` KHÔNG ĐƯỢC gộp vào `solo` ─────────────────────
//
// `project.teamSize` tắt được ba cơ chế phối hợp liên-người. Chế độ hỏng đáng sợ của nó
// KHÔNG phải "solo mà không tắt" (tốn vài giây, nhìn thấy được) mà là **"chưa khai mà bị
// đọc thành solo"**: mọi repo chưa chạy `setup.mjs` lặng lẽ mất guard đặt chỗ, và không ai
// quyết định điều đó. Đúng lớp lỗi mà cả W32 đi sửa — một tín hiệu hai giá trị nuốt mất
// trạng thái thứ ba và đổ về phía dễ chịu.
//
// Nên bảng này chủ yếu là các ca RÁC: `0`, `"1"` (chuỗi), `1.5`, `-1`, `null`, không có
// khoá. Tất cả PHẢI ra `teamSize=null` + `isSolo=false`. Chỉ số nguyên dương mới là câu
// trả lời, và chỉ đúng `1` mới bật solo.
//
// `config()` memo hoá trong một process ⇒ mỗi ca phải là một process riêng. Fixture in ra
// là một FILE (`print-team.mjs`), không phải `node -e` — Parity Contract.
{
  const L = ' '.repeat(15);
  const baseCfg = JSON.parse(readFileSync(repoPath('tooling', 'fixtures', 'config-guard-paths.json'), 'utf8'));
  const work = join(tmpdir(), `harness-teamsize-${process.pid}`);
  mkdirSync(work, { recursive: true });

  //        tên ca      giá trị teamSize   mong đợi teamSize()   mong đợi isSolo()
  const TABLE = [
    ['solo',            1,                 '1',                  'true'],
    ['đội 4 người',     4,                 '4',                  'false'],
    ['0',               0,                 'null',               'false'],
    ['chuỗi "1"',       '1',               'null',               'false'],
    ['1.5',             1.5,               'null',               'false'],
    ['-1',              -1,                'null',               'false'],
    ['null tường minh', null,              'null',               'false'],
    ['KHÔNG có khoá',   undefined,         'null',               'false'],
  ];

  const bad = [];
  for (const [name, value, wantSize, wantSolo] of TABLE) {
    const c = structuredClone(baseCfg);
    if (value === undefined) delete c.project.teamSize; else c.project.teamSize = value;
    const p = join(work, `cfg-${TABLE.findIndex(t => t[0] === name)}.json`);
    writeFileSync(p, JSON.stringify(c), 'utf8');
    const r = spawnSync(process.execPath, [repoPath('tooling', 'fixtures', 'print-team.mjs')], {
      encoding: 'utf8', cwd: repoPath(''), env: { ...process.env, ...TEST_ENV, HARNESS_CONFIG: p },
    });
    const out = String(r.stdout || '').trim();
    const want = `teamSize=${wantSize} isSolo=${wantSolo}`;
    if (out !== want) bad.push(`${name}: được \`${out || r.stderr?.trim().slice(0, 60)}\`, cần \`${want}\``);
  }
  rmSync(work, { recursive: true, force: true });

  if (bad.length) fail.push(`teamSize/isSolo${L} ${bad.length}/${TABLE.length} ca sai: ${bad.join(' | ')}`);
  else ok.push(`teamSize/isSolo${L} ${TABLE.length} ca — chỉ số nguyên dương là câu trả lời, chỉ \`1\` bật solo, 6 dạng rác đều ra \`chưa khai\``);
}

// ─── telemetry của FIXTURE không được rơi vào sổ THẬT ────────────────────────
//
// Cột `N qua · M chặn` là thứ `/harness-retro` bước 1 dặn đọc TRƯỚC, và bước 4 dùng để
// quyết định CẮT cái gì. Đo 2026-08-07: 2/6 mục `gate-fails.log` mang project id của
// FIXTURE. Tổng 6 lần chặn thật ra là 1 cứu thật · 3 dương tính giả · 2 rác.
//
// Suite thì SẠCH (`TEST_ENV` có `HARNESS_TELEMETRY_DIR`, `mutate()` truyền xuống). Nguồn rò
// là probe hook BẰNG TAY lúc phát triển. Nên phép kiểm phải chạy với biến môi trường đó
// BỊ XOÁ — nếu không nó khẳng định đúng cái ca không hỏng.
//
// So NHÃN chứ không so đường dẫn: đường dẫn chứa `tmpdir()` và thư mục repo ⇒ khác nhau
// theo máy và theo OS. Parity Contract.
{
  const L = ' '.repeat(13);
  const probe = repoPath('tooling', 'fixtures', 'print-telemetry-dir.mjs');
  const run = (cfg, extra = {}) => String(spawnSync(process.execPath, [probe], {
    encoding: 'utf8', cwd: repoPath(''),
    // `HARNESS_TELEMETRY_DIR: ''` — XOÁ cửa thoát của suite, tái hiện đúng ca probe tay.
    //
    // `HARNESS_TEST_RUN_ID` PHẢI ghim: fixture so `telemetryDir() === TEST_TELEMETRY_DIR` bằng
    // giá trị tính TRONG CON, còn ca thứ ba truyền vào giá trị của CHA. Trước #100 hai bên
    // trùng nhau nhờ cái tên cố định toàn máy — tức ca này đang lặng lẽ dựa vào đúng thứ gây
    // ra #100. Ghim id là cách nói ra sự phụ thuộc đó thay vì để nó ngầm.
    env: { ...process.env, ...TEST_ENV, HARNESS_TELEMETRY_DIR: '', HARNESS_TEST_RUN_ID: TEST_RUN_ID, HARNESS_CONFIG: cfg, ...extra },
  }).stdout || '').trim();

  const FIXTURE_CFG = repoPath('tooling', 'fixtures', 'config-guard-paths.json');
  const REAL_CFG = repoPath('harness.config.json');

  //        nhãn ca                              config        env thêm                        mong đợi
  const TABLE = [
    ['fixture + không có env',                   FIXTURE_CFG, {},                              'TEST'],
    ['config THẬT + không có env',               REAL_CFG,    {},                              'THẬT'],
    ['env thắng tất cả, kể cả với config thật',  REAL_CFG,    { HARNESS_TELEMETRY_DIR: TEST_TELEMETRY_DIR }, 'TEST'],
  ];
  const bad = [];
  for (const [name, cfg, extra, want] of TABLE) {
    const got = run(cfg, extra);
    if (got !== want) bad.push(`${name}: được \`${got}\`, cần \`${want}\``);
  }
  if (bad.length) fail.push(`telemetryDir${L} ${bad.length}/${TABLE.length} ca sai: ${bad.join(' | ')}`);
  else ok.push(`telemetryDir${L} ${TABLE.length} ca — project id \`fixture-*\` chuyển hướng khỏi sổ THẬT kể cả khi không ai set biến môi trường`);
}

// ─── verificationCoverage: mẫu số 0 phải HIỆN RA, nhưng chỉ ở đúng ca ────────
//
// Đo 2026-08-07: `sakubun-single-user` có harness v2.13.0 và `features/` thật = **0**, trong
// khi auto-memory ghi 4 mục "pending live verify" qua 2 project. Nợ xác minh CÓ THẬT, chỉ
// không nằm ở chỗ harness nhìn được.
//
// Nó không tự lộ vì mọi cơ chế đo lặp qua `features/*.json` ⇒ tập rỗng ⇒ XANH. Cùng lớp lỗi
// `evals/run.mjs` sửa ở v2.24.0 nhưng NGƯỢC CHIỀU: ở đó "chưa đo" thành FAIL, ở đây thành
// PASS — và không ai đi điều tra một dấu tick xanh.
//
// Bảng này chủ yếu khoá HAI VẾ MIỄN TRỪ, vì bỏ vế nào cũng hỏng theo một kiểu riêng:
//   · `template` — bỏ ⇒ tái tạo #56 lần thứ ba (đỏ vĩnh viễn trong repo template)
//   · `quiet`    — bỏ ⇒ nổ ở mọi repo mới toanh, thành nhiễu ngay ngày đầu
{
  const L = ' '.repeat(6);
  //        role         features  commits7d   mode           có advice?
  const TABLE = [
    ['consumer',  0,   14,   'empty',       true ],   // ca thật: ship mà không khai feature
    ['consumer',  3,   14,   'covered',     false],
    ['consumer',  0,    0,   'quiet',       false],   // repo mới — chưa ship thì chưa nợ
    ['template',  0,   14,   'template-na', false],   // #56 KHÔNG được tái tạo
    ['consumer',  0, null,   'unknown',     false],   // không đọc được git ⇒ `?`, không phải "ổn"
    ['unknown',   0,   14,   'empty',       true ],   // vai lạ ⇒ KHÔNG được miễn
  ];
  const bad = [];
  for (const [role, features, commits7d, wantMode, wantAdvice] of TABLE) {
    const r = verificationCoverage({ role, features, commits7d });
    const got = `${r.mode}/${Boolean(r.advice)}`;
    const want = `${wantMode}/${wantAdvice}`;
    if (got !== want) bad.push(`${role} f=${features} c=${commits7d}: ${got} ≠ ${want}`);
  }
  if (bad.length) fail.push(`verificationCoverage${L} ${bad.length}/${TABLE.length} ca sai: ${bad.join(' | ')}`);
  else ok.push(`verificationCoverage${L} ${TABLE.length} ca — chỉ "có commit mà 0 feature" mới kêu; template và repo mới được miễn, vai lạ thì không`);
}

// ─── coordinationLayer: repo TEMPLATE không được bị đòi khai `teamSize` ──────
//
// Bug #56 đang mở là đúng lớp này: một advice đỏ VĨNH VIỄN trong repo template, về một việc
// repo template KHÔNG ĐƯỢC làm. `harness.config.json` là SEED ⇒ một con số `teamSize` ở đây
// ship sang MỌI consumer như câu trả lời của họ. "Chưa khai" là trạng thái ĐÚNG ở template.
//
// BỐN trạng thái, không ba: `template-na` phải tách khỏi `unknown`, vì chỉ `unknown` mới
// sinh advice. Gộp hai cái đó là tái tạo lại #56 ở một file khác.
{
  const L = ' '.repeat(11);
  //          teamSize    role         mode           có advice?
  const TABLE = [
    [1,          'consumer', 'solo',        false],
    [4,          'consumer', 'team',        false],
    [undefined,  'consumer', 'unknown',     true ],
    [undefined,  'template', 'template-na', false],
    [1,          'template', 'solo',        false],   // đã khai thì tôn trọng, kể cả ở template
    [0,          'template', 'template-na', false],   // rác ⇒ coi như chưa khai ⇒ vẫn miễn
    [0,          'consumer', 'unknown',     true ],
    [undefined,  'unknown',  'unknown',     true ],   // không nhận ra vai ⇒ KHÔNG được miễn
  ];
  const bad = [];
  for (const [ts, role, wantMode, wantAdvice] of TABLE) {
    const r = coordinationLayer({ teamSize: ts, role });
    const got = `${r.mode}/${Boolean(r.advice)}`;
    const want = `${wantMode}/${wantAdvice}`;
    if (got !== want) bad.push(`teamSize=${JSON.stringify(ts)} role=${role}: ${got} ≠ ${want}`);
  }
  if (bad.length) fail.push(`coordinationLayer${L} ${bad.length}/${TABLE.length} ca sai: ${bad.join(' | ')}`);
  else ok.push(`coordinationLayer${L} ${TABLE.length} ca — template KHÔNG bị đòi khai teamSize (bug #56 không tái tạo), vai lạ thì vẫn bị đòi`);
}

// ─── budgetStatus: trần khai rồi mà chưa đo KHÔNG được đọc là "ổn" ───────────
//
// `budget.monthlyUsdCap` là field MA cho tới v2.28.0: nơi DUY NHẤT đọc nó là một dòng advice
// nói "= 0". Đặt $50 vào cũng không có gì xảy ra — và chính điều đó khiến người ta TIN là
// có lớp bảo vệ. Cùng lớp với `modelTiering` bị cắt ở 2.0.0.
//
// Ca phải khoá chặt nhất là `unmeasured`: cap > 0, `capo-history.json` rỗng. Nếu ca đó đổ
// về `ok` thì bản vá này TỆ HƠN field ma — nó biến một con số không làm gì thành một dấu
// tick xanh, và không ai đi điều tra một dấu tick xanh.
{
  const L = ' '.repeat(13);
  const DAY = 86400000;
  const NOW = Date.parse('2026-08-07T00:00:00.000Z');
  const at = (d) => new Date(NOW - d * DAY).toISOString();
  //          cap    alert   latest                              mode          có advice?
  const TABLE = [
    [0,    80, null,                                  'off',        true ],  // chưa khai trần
    [50,   80, null,                                  'unmeasured', true ],  // ← ca nguy hiểm nhất
    [50,   80, { usd: 10, days: 7, at: at(90) },      'stale',      true ],  // đo 3 tháng trước
    [50,   80, { usd: 7,  days: 30, at: at(3) },      'ok',         false],  // run-rate $7 = 14%
    [50,   80, { usd: 10, days: 7, at: at(3) },       'alert',      true ],  // $42.9/tháng = 86%
    [50,   80, { usd: 15, days: 7, at: at(3) },       'over',       true ],  // $64.3/tháng = 129%
    [200,  80, { usd: 40, days: 7, at: at(1) },       'alert',      true ],  // $171/tháng = 86%
    [200,  95, { usd: 40, days: 7, at: at(1) },       'ok',         false],  // ngưỡng 95 ⇒ chưa kêu
    [50,   80, { usd: 10, days: 0, at: at(1) },       'unmeasured', true ],  // days=0 ⇒ chia 0
    [50,   80, { usd: 'nhiều', days: 7, at: at(1) },  'unmeasured', true ],  // rác
    [50,   80, { usd: 10, days: 7, at: 'hôm qua' },   'unmeasured', true ],  // ngày không parse được
    ['50', 80, { usd: 7,  days: 30, at: at(3) },      'ok',         false],  // cap dạng chuỗi vẫn đọc được
  ];
  const bad = [];
  for (const [cap, alertAtPercent, latest, wantMode, wantAdvice] of TABLE) {
    const r = budgetStatus({ cap, alertAtPercent, latest, now: NOW });
    const got = `${r.mode}/${Boolean(r.advice)}`;
    const want = `${wantMode}/${wantAdvice}`;
    if (got !== want) bad.push(`cap=${cap} ${JSON.stringify(latest)}: ${got} ≠ ${want}`);
  }
  // `ok` cũng phải mang theo BẰNG CHỨNG — một dòng xanh không kiểm được thì bị bỏ qua.
  const okCase = budgetStatus({ cap: 50, latest: { usd: 7, days: 30, at: at(3) }, now: NOW });
  if (okCase.percent !== 14 || okCase.ageDays !== 3) bad.push(`ok thiếu số đo: percent=${okCase.percent} ageDays=${okCase.ageDays}`);

  if (bad.length) fail.push(`budgetStatus${L} ${bad.length}/${TABLE.length + 1} ca sai: ${bad.join(' | ')}`);
  else ok.push(`budgetStatus${L} ${TABLE.length + 1} ca — khai trần mà CHƯA ĐO là \`unmeasured\`, không phải "ổn"`);

  // Doctor in bằng một bảng tra `mode → dòng`. Thiếu một mode ⇒ nó in `undefined` — và đó là
  // ca KHÔNG bảng thuần nào ở trên bắt được, vì lỗi nằm ở chỗ HIỂN THỊ. Không dựng repo có
  // `cap > 0` được (`harness.config.json` là vùng cấm), nên đối chiếu bằng mã nguồn.
  // MODES phải ĐO TỪ NGUỒN, không chép tay. Bản trước là một mảng literal 12 phần tử, và
  // `template-plan` (2026-08-13) vào codebase với ĐÚNG 0 coverage: mutant "bỏ nhánh
  // `template-plan` khỏi rituals" và mutant "bỏ dòng hiển thị khỏi doctor" đều KHÔNG bị giết,
  // trong khi hai ca dưới vẫn xanh và vẫn in một con số đọc như độ phủ ("đủ 11 mode"). Danh
  // sách-phải-nhớ-cập-nhật là dạng rule cứng trá hình: nó mục đúng lúc có thứ mới cần phủ.
  //
  // Sàn 13 là bắt buộc, không phải cho chắc: `MODES` rỗng làm CẢ HAI ca `filter(...).length === 0`
  // ⇒ xanh vô căn cứ. Sai theo chiều DỄ CHỊU, `L0005`. Phép bóc trôi thì phải kêu, không im.
  const libSrc = readFileSync(repoPath('tooling', 'lib', 'harness.mjs'), 'utf8');
  const bsStart = libSrc.indexOf('export function budgetStatus(');
  const bsEnd = libSrc.indexOf('\nexport ', bsStart + 1);
  const bsBlock = bsStart >= 0 ? libSrc.slice(bsStart, bsEnd > bsStart ? bsEnd : undefined) : '';
  const MODES = [...new Set([...bsBlock.matchAll(/\bmode:\s*'([a-z-]+)'/g)].map(m => m[1]))];
  const MODES_FLOOR = 13;
  if (MODES.length < MODES_FLOOR) {
    fail.push(`budgetStatus${L} chỉ bóc được ${MODES.length} mode từ nguồn \`budgetStatus\` (sàn ${MODES_FLOOR}) — `
      + 'phép bóc đã trôi, và MODES thiếu làm HAI ca "đủ mode" dưới đây xanh mà không kiểm gì cả');
  } else {
    ok.push(`budgetStatus${L} ${MODES.length} mode bóc TỪ NGUỒN (sàn ${MODES_FLOOR}) — mode mới không vào được codebase mà không có ai phủ`);
  }
  const doc = readFileSync(repoPath('tooling', 'harness-doctor.mjs'), 'utf8');
  // CẮT ĐÚNG KHỐI, không cắt tới cuối file. Bản trước lấy từ `── NGÂN SÁCH ──` tới hết file, nên
  // một bảng `mode → dòng` KHÁC ở phía dưới (§VÒNG HỌC có `unmeasured:` · `stale:` · `ok:`) đủ
  // sức thoả mãn check này thay cho bảng ngân sách — ca sẽ xanh cả khi ba dòng kia bị xoá.
  // Đúng nguyên nhân ③ của `L0006` §mutant: neo RỘNG HƠN thứ nó khoá, và lô #185 vừa vô tình
  // tạo ra đúng cái bảng thứ hai đó.
  const bStart = doc.indexOf('── NGÂN SÁCH ──'), bEnd = doc.indexOf('── Git / phối hợp ─');
  const budgetBlock = (bStart >= 0 && bEnd > bStart) ? doc.slice(bStart, bEnd) : '';
  if (!budgetBlock) fail.push(`budgetStatus${L} không định vị được khối NGÂN SÁCH trong harness-doctor.mjs — mốc cắt đã trôi`);
  // Hai dạng khoá: `off:` và `'template-na':` — mode có gạch ngang phải viết trong nháy.
  const missing = MODES.filter(m => !new RegExp(`^\\s{4}'?${m}'?:`, 'm').test(budgetBlock));
  if (missing.length) fail.push(`budgetStatus${L} harness-doctor thiếu dòng cho mode: ${missing.join(' · ')} — sẽ in \`undefined\``);
  else ok.push(`budgetStatus${L} harness-doctor có dòng cho cả ${MODES.length} mode (không mode nào in \`undefined\`)`);

  // ── GÓI PHẲNG (#111) ──────────────────────────────────────────────────────
  //
  // Với subscription phẳng, chi tiêu BẰNG ĐỊNH NGHĨA đúng bằng trần ⇒ `percent >= 100` luôn
  // đúng ⇒ `over` không bao giờ tắt. Đo 2026-08-08: dữ liệu ĐÚNG (`--days 30 --usd 20`, cap
  // 20) vẫn ra `over` 100%. Một cảnh báo luôn bật không phân biệt được với không có cảnh báo.
  //
  // Hai hàng phải khoá chặt nhất:
  //   · `metered` (và KHÔNG khai `plan`) phải giữ NGUYÊN hành vi cũ — bản vá này không được
  //     đụng tới project trả theo mức dùng;
  //   · `flat` + `rateLimitHits: null` phải là `?`, KHÔNG phải `flat-ok`. "Chưa đọc được sổ"
  //     và "chưa chạm lần nào" là hai chuyện — gộp chúng là đúng phép gộp AGENTS.md cấm.
  const FULL = { usd: 20, days: 30, at: at(1) };
  const PLAN_TABLE = [
    //  plan        cap  role        hits   mode              configPlan
    ['flat',      0,   'consumer',  0,     'flat-ok'],
    ['flat',      20,  'consumer',  12,    'flat-limited'],
    ['flat',      20,  'consumer',  null,  'flat-unmeasured'],
    ['flat',      0,   'template',  0,     'flat-ok'],       // template không cap, gói khai bằng env ⇒ vẫn phẳng
    ['flat',      20,  'template',  0,     'template-cap'],  // ← cap lạc vào template VẪN phải kêu
    ['metered',   20,  'consumer',  0,     'over'],          // ← hành vi cũ, không được đổi
    [undefined,   20,  'consumer',  0,     'over'],          // ← không khai plan = metered

    // ── ĐƯỜNG RÒ THỨ HAI: `plan` khai trong CONFIG chảy xuống consumer (2026-08-13) ──
    //
    // Cột cuối là NGUỒN, và nó là cả bản vá: cùng một `plan: 'flat'` đã hợp nhất, hai hàng đầu
    // dưới đây phải ra HAI kết quả khác nhau. Một hàng thôi thì mutant "kêu bất kể nguồn" sống,
    // và nó sống theo chiều bắn nhầm vào người khai đúng (`L0007` + `lessons/0002`).
    ['flat',      0,   'template',  3,     'template-plan',   'flat'],     // ← khai bằng CONFIG ⇒ kêu
    ['flat',      0,   'template',  3,     'flat-limited',    'metered'],  // ← khai bằng ENV ⇒ đo bình thường
    ['flat',      0,   'template',  3,     'template-plan',   ' FLAT '],   // ← hoa/thường + space không cứu
    ['flat',      0,   'consumer',  3,     'flat-limited',    'flat'],     // ← consumer khai gói CỦA MÌNH: hợp lệ
    ['flat',      20,  'template',  0,     'template-cap',    'flat'],     // ← cả hai field rò ⇒ CAP kêu trước
  ];
  const badPlan = [];
  for (const [plan, cap, role, rateLimitHits, want, configPlan] of PLAN_TABLE) {
    const got = budgetStatus({ cap, role, plan, configPlan, rateLimitHits, latest: FULL });
    if (got.mode !== want) badPlan.push(`plan=${plan}${configPlan === undefined ? '' : `/cfg=${configPlan}`} cap=${cap} role=${role} hits=${rateLimitHits} → ${got.mode}, cần ${want}`);
  }
  if (badPlan.length) fail.push(`budgetStatus${L} gói phẳng ${badPlan.length}/${PLAN_TABLE.length} ca sai: ${badPlan.join(' | ')}`);
  else ok.push(`budgetStatus${L} ${PLAN_TABLE.length} ca gói phẳng — \`metered\` KHÔNG đổi, "chưa đọc được sổ" ≠ "chưa chạm lần nào", và \`plan\` khai bằng CONFIG ≠ khai bằng ENV`);

  // ── TIỀN ĐỀ của gác `template-plan`: đo THIỆT HẠI, không tả nó ─────────────
  //
  // Ca này KHÔNG kiểm bản vá — nó kiểm điều khiến bản vá đáng tồn tại: `plan: flat` thừa kế
  // xuống một consumer có trần thật làm trần đó TRƠ. Nếu một ngày nhánh phẳng học cách so cap,
  // hai dòng dưới đổi kết quả và gác `template-plan` mất lý do; lúc đó phải xét lại GÁC, không
  // phải sửa số cho test xanh. Không có ca này thì lý do chỉ nằm trong comment, và comment
  // không fail được.
  const OVER30 = { usd: 500, days: 30, at: at(1) };
  const asMetered = budgetStatus({ cap: 50, role: 'consumer', plan: 'metered', rateLimitHits: 3, latest: OVER30 });
  const asFlat = budgetStatus({ cap: 50, role: 'consumer', plan: 'flat', rateLimitHits: 3, latest: OVER30 });
  if (asMetered.mode !== 'over' || asMetered.percent !== 1000 || asFlat.mode !== 'flat-limited' || asFlat.percent != null) {
    fail.push(`budgetStatus${L} tiền đề của \`template-plan\` không còn đúng — metered → ${asMetered.mode}/${asMetered.percent}, `
      + `flat → ${asFlat.mode}/${asFlat.percent}. Xét lại chính cái gác, đừng sửa con số.`);
  } else {
    ok.push(`budgetStatus${L} thiệt hại ĐO ĐƯỢC: cap $50 + chi $500/30 ngày ⇒ metered \`over\` 1000% · flat thừa kế \`flat-limited\` percent=null (trần thành trơ)`);
  }

  // ── CHẠM TRẦN N LẦN, VÀ N ĐÓ ĐỔI ĐƯỢC BAO NHIÊU (#180) ────────────────────
  //
  // `hits > 0` là một sự thật BẤT BIẾN trong 30 ngày: không hành động nào hôm nay làm nó nhỏ
  // lại. Map thẳng nó thành `due` cho `rituals` một mục đỏ mà **người dùng không tắt được kể
  // cả khi làm đúng mọi thứ** — `lessons/0002`, đúng dạng vừa sửa cho `flat-ok` ở v2.61.0.
  //
  // Ca đáng canh nhất là `capoTran: 0`: **0 là một số đo THẬT** (chạm trần trong cửa sổ 30
  // ngày, nhưng 0 lần trong cửa sổ 7 ngày của mục). Một phép kiểm `if (!capoTran)` nuốt nó và
  // rơi ngược về `flat-limited` — số đo có thật mà đọc thành chưa đo, `lessons/0006`.
  const RD = [
    // nhãn                          entries                                                  đọc được?
    ['mục hợp lệ',                   [{ at: at(2), days: 30, capoTran: 0.15, hits: 19 }],      true ],
    ['capoTran = 0 LÀ số đo',        [{ at: at(2), days: 7, capoTran: 0, hits: 0 }],           true ],
    ['mục CUỐI thắng',               [{ at: at(2), days: 30, capoTran: 9 }, { at: at(1), days: 30, capoTran: 0.2 }], true ],
    ['đúng hạn 30 ngày',             [{ at: at(30), days: 30, capoTran: 0.15 }],               true ],
    ['quá hạn 31 ngày',              [{ at: at(31), days: 30, capoTran: 0.15 }],               false],
    ['mục ở TƯƠNG LAI (lệch giờ)',   [{ at: at(-3), days: 30, capoTran: 0.15 }],               false],
    ['thiếu capoTran',               [{ at: at(2), days: 30, hits: 19 }],                      false],
    ['capoTran âm',                  [{ at: at(2), days: 30, capoTran: -1 }],                  false],
    ['days = 0',                     [{ at: at(2), days: 0, capoTran: 0.15 }],                 false],
    ['ngày không parse được',        [{ at: 'hôm qua', days: 30, capoTran: 0.15 }],            false],
    ['sổ rỗng',                      [],                                                       false],
    ['không phải mảng',              null,                                                     false],
  ];
  const badRd = [];
  for (const [label, entries, want] of RD) {
    const got = flatCapoReading(entries, NOW) !== null;
    if (got !== want) badRd.push(`${label}: đọc được=${got}, cần ${want}`);
  }
  // Mục giữ NGUYÊN cửa sổ của nó. Giả định 30 ở bên đọc làm tỉ lệ 7 ngày bị in cạnh "19 lần
  // trong 30 ngày" như thể cùng một cửa sổ — một phân số ghép từ hai khoảng thời gian.
  const win = flatCapoReading([{ at: at(1), days: 7, capoTran: 0.4 }], NOW);
  if (win?.days !== 7) badRd.push(`cửa sổ của mục bị mất: days=${win?.days} ≠ 7`);

  // HAI ĐẦU: `budgetStatus` phải ĐỔI MODE theo số đo đó, không chỉ mang thêm một field mà
  // không nhánh nào rẽ. Và chiều NGƯỢC — số đo quá hạn phải rơi LẠI `flat-limited`, nếu không
  // thì mục này tắt vĩnh viễn sau đúng một lần đo, và ta đổi một cảnh báo luôn bật lấy một
  // cảnh báo không bao giờ bật.
  const FRESH = [{ at: at(2), days: 30, capoTran: 0.15, hits: 19 }];
  const STALE = [{ at: at(60), days: 30, capoTran: 0.15, hits: 19 }];
  const withCapo = budgetStatus({ cap: 0, role: 'consumer', plan: 'flat', rateLimitHits: 19, flatCapo: FRESH, now: NOW });
  const withStale = budgetStatus({ cap: 0, role: 'consumer', plan: 'flat', rateLimitHits: 19, flatCapo: STALE, now: NOW });
  const zeroHits = budgetStatus({ cap: 0, role: 'consumer', plan: 'flat', rateLimitHits: 0, flatCapo: FRESH, now: NOW });
  if (withCapo.mode !== 'flat-capo') badRd.push(`đã đo mà mode = ${withCapo.mode} ≠ flat-capo`);
  if (withCapo.flatCapo !== 0.15 || withCapo.flatDays !== 30) badRd.push(`flat-capo thiếu số đo: ${withCapo.flatCapo}/${withCapo.flatDays}`);
  if (withCapo.advice) badRd.push('flat-capo vẫn còn `advice` — nó không phải việc tới hạn nữa');
  if (withStale.mode !== 'flat-limited') badRd.push(`số đo 60 ngày mà mode = ${withStale.mode} ≠ flat-limited — mục sẽ tắt vĩnh viễn sau MỘT lần đo`);
  if (zeroHits.mode !== 'flat-ok') badRd.push(`0 lần chạm + có số đo ⇒ ${zeroHits.mode} ≠ flat-ok — không chạm trần thì không có gì để chia`);

  if (badRd.length) fail.push(`flatCapoReading${L.slice(3)} ${badRd.length}/${RD.length + 6} ca sai: ${badRd.join(' | ')}`);
  else ok.push(`flatCapoReading${L.slice(3)} ${RD.length + 6} ca — \`capoTran: 0\` LÀ số đo · cửa sổ đi theo mục · quá hạn rơi LẠI \`flat-limited\``);

  // Hai tầng khai `plan`: env THEO NGƯỜI thắng config THEO ĐỘI. Ca thứ ba là ca có giá trị —
  // một đội có người dùng Pro phẳng và người dùng API theo mức dùng, và ép cả hai theo một
  // khoá trong config là báo sai cho ít nhất một người.
  const PLAN_SRC = [
    ['không khai gì',            null,                    {},                                'metered'],
    ['config: flat',             { budget: { plan: 'flat' } },    {},                        'flat'],
    ['env đè config',            { budget: { plan: 'metered' } }, { HARNESS_BUDGET_PLAN: 'flat' },    'flat'],
    ['env đè ngược lại',         { budget: { plan: 'flat' } },    { HARNESS_BUDGET_PLAN: 'metered' }, 'metered'],
    ['giá trị lạ ⇒ metered',     { budget: { plan: 'FLATT' } },   {},                        'metered'],
    ['hoa thường không quan trọng', { budget: { plan: 'FLAT' } }, {},                        'flat'],
  ];
  const badSrc = [];
  for (const [label, cfgIn, env, want] of PLAN_SRC) {
    const got = budgetPlan(cfgIn, env);
    if (got !== want) badSrc.push(`${label} → ${got}, cần ${want}`);
  }
  if (badSrc.length) fail.push(`budgetPlan${L.slice(2)} ${badSrc.length}/${PLAN_SRC.length} ca sai: ${badSrc.join(' | ')}`);
  else ok.push(`budgetPlan${L.slice(2)} ${PLAN_SRC.length} ca — env THEO NGƯỜI thắng config THEO ĐỘI, giá trị lạ về \`metered\` chứ không ném`);

  // ── VAI CỦA REPO (#92) ────────────────────────────────────────────────────
  //
  // `setup.mjs:55` TỪ CHỐI ghi cấu hình ở repo template. Trước #92, `budgetStatus` không nhận
  // `role` nên nó trả `off` — *"chưa khai trần, KHÔNG phải ổn"* — ở đúng nơi harness cấm khai.
  // Ca phải khoá chặt nhất là hàng thứ ba: cap > 0 Ở TEMPLATE là con số ghi tay sẽ CHẢY XUỐNG
  // mọi consumer. Nếu ca đó đọc thành `ok`/`n/a` thì bản vá này còn tệ hơn bug: nó dạy người
  // ta rằng một cap trong template là bình thường.
  const ROLE_TABLE = [
    //  role         cap  latest                          mode            measured  advice?
    ['template',   0,   null,                          'template-na',  false,   true ],
    ['template',   0,   { usd: 43, days: 7, at: at(2) }, 'template-na',  true,    false],
    ['template',   50,  null,                          'template-cap', false,   true ],  // ← rò rỉ
    ['consumer',   0,   null,                          'off',          false,   true ],
    ['consumer',   50,  null,                          'unmeasured',   false,   true ],
    ['unknown',    0,   null,                          'off',          false,   true ],
    [null,         0,   null,                          'off',          false,   true ],  // không khai vai
  ];
  const badRole = [];
  for (const [role, cap, latest, wantMode, wantMeasured, wantAdvice] of ROLE_TABLE) {
    const r = budgetStatus({ cap, latest, role, now: NOW });
    const got = `${r.mode}/${r.measured}/${Boolean(r.advice)}`;
    const want = `${wantMode}/${wantMeasured}/${wantAdvice}`;
    if (got !== want) badRole.push(`role=${role} cap=${cap}: ${got} ≠ ${want}`);
  }
  // `measured` phải là ĐÚNG phép kiểm mà `unmeasured` dùng — không phải một phép kiểm lỏng
  // hơn. Entry có `usd` hợp lệ mà `days: 0` là số đo KHÔNG dùng được (chia cho 0), nên
  // template phải đọc nó là "chưa đo", không phải "đã đo".
  const div0 = budgetStatus({ cap: 0, role: 'template', latest: { usd: 43, days: 0, at: at(2) }, now: NOW });
  if (div0.measured !== false) badRole.push(`days=0 ở template: measured=${div0.measured} ≠ false (mẫu số 0 KHÔNG phải một phép đo)`);

  if (badRole.length) fail.push(`budgetStatus${L} ${badRole.length}/${ROLE_TABLE.length + 1} ca VAI sai: ${badRole.join(' | ')}`);
  else ok.push(`budgetStatus${L} ${ROLE_TABLE.length + 1} ca vai — template KHÔNG bị đòi khai trần (setup.mjs cấm), và cap>0 ở template thì KÊU`);

  // HAI ĐẦU MỘT HỢP ĐỒNG: `rituals.mjs` cũng phân nhánh theo `mode`. Doctor có đủ dòng mà
  // rituals thiếu một nhánh thì mode đó rơi xuống `return { state: 'ok' }` cuối hàm — tức một
  // trạng thái CHƯA XỬ LÝ đọc thành XANH. Đây là ca `harness-doctor` ở trên không bắt được.
  const rit = readFileSync(repoPath('tooling', 'rituals.mjs'), 'utf8');
  const capoBlock = rit.slice(rit.indexOf("id: 'capo-report'"), rit.indexOf("id: 'claude-code-drift'"));
  const ritMissing = MODES.filter(m => m !== 'ok' && !capoBlock.includes(`'${m}'`));
  if (ritMissing.length) fail.push(`budgetStatus${L} rituals capo-report không phân nhánh cho mode: ${ritMissing.join(' · ')} — rơi xuống \`ok\` cuối hàm, tức CHƯA XỬ LÝ đọc thành XANH`);
  else ok.push(`budgetStatus${L} rituals capo-report phân nhánh đủ ${MODES.length - 1} mode (không mode nào rơi nhầm xuống \`ok\`)`);
}

// ─── mergeState: squash-merge KHÔNG được đọc thành "chưa merge" ──────────────
//
// `git branch --merged` hỏi *"commit này có phải tổ tiên của main không"*. Squash-merge tạo
// một commit MỚI, nên nhánh ĐÃ merge và nhánh CHƯA TỪNG CÓ PR đọc giống hệt nhau. Repo này
// squash 100% số PR ⇒ bộ dò cũ chưa từng đúng một lần nào (issue #97).
//
// Ca phải khoá chặt nhất KHÔNG phải ca squash — mà là ca `unknown`. Nếu "không hỏi được
// GitHub" đổ về `open`, bản vá này chỉ đổi câu chữ chứ không đổi bản chất: `wt-clean` lại
// khẳng định "chưa merge" về một thứ nó không biết. Nếu nó đổ về `merged` thì còn tệ hơn —
// XOÁ một worktree chưa merge vì không hỏi được ai.
{
  const L = ' '.repeat(13);
  const gh = (json) => () => ({ status: 0, stdout: JSON.stringify(json), stderr: '' });
  const err = (stderr) => () => ({ status: 1, stdout: '', stderr });
  const MERGED = new Set(['feat/da-la-to-tien']);
  //   nhãn                          branch                 ask                                      mode
  const TABLE = [
    ['git nói tổ tiên',              'feat/da-la-to-tien',  err('không bao giờ được gọi'),           'merged' ],
    ['squash: GitHub nói đã merge',  'fix/97-x',            gh([{ number: 89, mergedAt: '2026-08-07T13:10:45Z' }]), 'merged'],
    ['GitHub nói KHÔNG có PR merged','fix/dang-lam',        gh([]),                                  'open'   ],
    ['không có gh trên máy',         'fix/dang-lam',        err('spawn gh ENOENT'),                  'unknown'],
    ['gh chưa đăng nhập',            'fix/dang-lam',        err('gh: To get started with GitHub CLI, please run: gh auth login'), 'unknown'],
    ['gh trả rác',                   'fix/dang-lam',        () => ({ status: 0, stdout: '<html>' }),  'unknown'],
    ['gh trả object thay vì mảng',   'fix/dang-lam',        gh({ number: 1 }),                       'unknown'],
    ['detached HEAD',                '',                    gh([]),                                  'unknown'],
    ['ask ném ra undefined',         'fix/dang-lam',        () => undefined,                         'unknown'],
  ];
  const bad = [];
  for (const [label, branch, ask, want] of TABLE) {
    const r = mergeState(branch, { mergedSet: MERGED, ask });
    if (r.state !== want) bad.push(`${label}: ${r.state} ≠ ${want}`);
    // Mọi trạng thái phải NÓI RA VÌ SAO. Một `unknown` không kèm lý do thì người đọc không
    // phân biệt được "chưa cài gh" với "repo này không ở GitHub", và sẽ bỏ qua cả hai.
    if (!r.why) bad.push(`${label}: thiếu \`why\` — trạng thái không giải thích được thì bị bỏ qua`);
  }
  // Bằng chứng phải mang SỐ PR, không chỉ nói "đã merge" — reviewer phải tra lại được.
  const sq = mergeState('fix/97-x', { mergedSet: MERGED, ask: gh([{ number: 89, mergedAt: '2026-08-07T13:10:45Z' }]) });
  if (sq.pr !== 89 || !sq.why.includes('#89')) bad.push(`ca squash thiếu số PR trong bằng chứng: pr=${sq.pr} why=${sq.why}`);

  if (bad.length) fail.push(`mergeState${L} ${bad.length} ca sai: ${bad.join(' | ')}`);
  else ok.push(`mergeState${L} ${TABLE.length + 1} ca — squash-merge ĐƯỢC nhận ra, và "không hỏi được" là \`unknown\` chứ KHÔNG phải \`open\``);

  // HAI ĐẦU: `wt-clean.mjs` phải phân nhánh cho cả BA trạng thái. Thiếu `unknown` ⇒ nó rơi vào
  // nhánh `else` cuối cùng và in nhầm nhãn — đúng bug #97 với một cái tên mới.
  //
  // `codeOnly` KHÔNG phải trang trí. Bản đầu của khối này so trên văn bản THÔ và mutant D
  // (gỡ sạch lời gọi `mergeState` khỏi wt-clean) **đi lọt**, vì chữ `mergeState` vẫn nằm
  // trong comment giải thích. Một assertion không giết được mutant của chính nó là một
  // assertion chưa tồn tại — nó chỉ trông như đã tồn tại. Lần thứ tư của bài học này.
  const wt = codeOnly(readFileSync(repoPath('tooling', 'wt-clean.mjs'), 'utf8'));
  const miss = ['merged', 'open', 'unknown'].filter(s => !new RegExp(`state === '${s}'|\\b${s}\\.push\\(`).test(wt));
  if (miss.length) fail.push(`mergeState${L} wt-clean.mjs không phân nhánh cho: ${miss.join(' · ')} — rơi vào \`else\` và in nhầm nhãn`);
  else ok.push(`mergeState${L} wt-clean.mjs phân nhánh đủ cả 3 trạng thái (unknown KHÔNG bị gộp vào open)`);

  // `wt-clean.mjs` KHÔNG được còn dùng phép hỏi cũ làm căn cứ DUY NHẤT. Nó vẫn được phép gọi
  // `--merged` (đó là bằng chứng dương rẻ tiền), nhưng phải qua `mergeState`.
  if (!/mergeState\s*\(/.test(wt)) fail.push(`mergeState${L} wt-clean.mjs không GỌI \`mergeState\` — bug #97 quay lại được mà không ai biết`);
  else ok.push(`mergeState${L} wt-clean.mjs đi qua \`mergeState\`, không tự hỏi \`--merged\` rồi tự kết luận`);

  // `codeOnly` tự nó phải được chứng minh, nếu không nó chỉ dời chỗ cho cùng một sự tự tin.
  const cSample = codeOnly('/* mergeState trong comment */\nconst a = 1; // mergeState nữa\nconst u = "https://x/y";');
  if (/mergeState/.test(cSample)) fail.push(`mergeState${L} codeOnly KHÔNG bỏ được comment — mọi phép kiểm dựng trên nó là vô nghĩa`);
  else if (!cSample.includes('https://x/y')) fail.push(`mergeState${L} codeOnly cắt nhầm URL trong chuỗi — nó sẽ báo oan`);
  else ok.push(`mergeState${L} codeOnly bỏ comment (khối + dòng) mà KHÔNG cắt \`https://\` trong chuỗi`);

  // BÁO OAN LÀ CHIỀU HỎNG THẬT SỰ CỦA HÀM NÀY, và bản đầu đã hỏng đúng như vậy: một template
  // literal chứa `features/*.json` trong `rituals.mjs` bị đọc là MỞ block comment, nuốt 176
  // dòng code, và assertion dựng trên nó báo thiếu một thứ đang nằm ngay trong file.
  const trap = codeOnly('const a = `features/*.json`;\n/** thật */\nconst GIU_LAI = 1;');
  if (!/GIU_LAI/.test(trap)) fail.push(`mergeState${L} codeOnly coi \`/*\` TRONG CHUỖI là mở comment ⇒ nuốt code thật và BÁO OAN`);
  else if (/thật/.test(trap)) fail.push(`mergeState${L} codeOnly không bỏ được block comment đứng sau một chuỗi có \`/*\``);
  else ok.push(`mergeState${L} codeOnly biết CHUỖI: \`/*\` trong template literal KHÔNG mở comment`);
}

// ─── GÓI PHẲNG: mẫu số của CAPO là LẦN CHẠM TRẦN, không phải USD ─────────────
//
// Với subscription phẳng, chi tiêu tháng BẰNG ĐỊNH NGHĨA đúng bằng trần, nên `USD / accepted`
// là một hằng số chia cho accepted — nó không đo gì về hiệu quả. `budgetStatus` đã biết điều
// đó từ #111; `capo-report` thì chưa, và nó vẫn đòi một con số mà chính hint của nó ghi là
// *"harness KHÔNG đọc được hoá đơn"*, trong khi con số RÀNG BUỘC nằm sẵn trong `budget-alarm.log`.
//
// BA CA, và ca thứ hai là ca tôi làm SAI ở bản đầu: tôi gộp "sổ vắng" với "đọc hỏng" thành `?`.
// Nghe an toàn mà sai hai lần — nó biến một repo yên ả thành `?` vĩnh viễn, VÀ nó làm hai công
// cụ đọc cùng một cái sổ trả lời khác nhau (đúng #125, thứ `budgetSnapshot` ra đời để chống).
{
  const L = ' '.repeat(13);
  const bad = [];
  const tel = mkdtempSync(join(tmpdir(), 'harness-capo-tel-'));
  const st = mkdtempSync(join(tmpdir(), 'harness-capo-st-'));
  const runCapo = (env) => spawnSync(process.execPath, [repoPath('tooling', 'capo-report.mjs'), '--days', '30'],
    { encoding: 'utf8', cwd: repoPath(''), env: { ...process.env, HARNESS_STATE_DIR: st, HARNESS_TELEMETRY_DIR: tel, ...env } });

  // HAI VẾ CHO MỖI KHẲNG ĐỊNH, và đó KHÔNG phải nới lỏng. `accepted` đến từ lịch sử git của
  // repo đang chạy suite; checkout `pull_request` ở CI có **0 merge** trong cửa sổ ⇒ nhánh
  // `!accepted` chạy thay cho nhánh tính tỉ lệ. Bản đầu chỉ khớp nhánh tính tỉ lệ và **đỏ cả ba
  // OS trong khi máy tôi xanh** — đúng `knowledge/lessons/0003` (self-test giả định repo của
  // nó), và khối `capo` ngay trên đã ghi lại bài học đó trước khi tôi viết ca này.
  //
  // Con số HITS có mặt ở CẢ HAI nhánh, nên nó là bất biến không phụ thuộc lịch sử git. Hai vế
  // dưới đây nêu ĐÍCH DANH hai câu thật, không phải một từ khoá lỏng lẻo bắt trúng chỗ khác.
  const zero = /CAPO-TRẦN = 0\.00|gói PHẲNG: 0 lần chạm trần/;
  const three_ = /\(3 lần ·|gói PHẲNG: 3 lần chạm trần/;

  // ① sổ VẮNG ⇒ `0`, KHÔNG phải `?`. `observe.mjs` chưa từng ghi lần nào LÀ một số đo.
  const empty = runCapo({ HARNESS_BUDGET_PLAN: 'flat' });
  if (empty.status !== 0) bad.push(`sổ vắng: exit ${empty.status} ≠ 0`);
  if (/ĐỌC HỎNG/.test(empty.stdout || '')) bad.push('sổ VẮNG bị đọc thành ĐỌC HỎNG — một repo chưa từng chạm trần thành `?` vĩnh viễn, và nó lệch với `budgetSnapshot` trên cùng cái sổ');
  else if (!zero.test(empty.stdout || '')) bad.push('sổ vắng không khai ra 0 lần chạm trần');

  // ② sổ CÓ ba lần chạm ⇒ con số phải là 3, và phải lọt vào cửa sổ `--days`.
  const now = Date.now();
  writeFileSync(join(tel, 'budget-alarm.log'),
    [1, 2, 3].map(i => `${new Date(now - i * 3600_000).toISOString()}|fixture|rate_limit|money|attended`).join('\n') + '\n');
  const three = runCapo({ HARNESS_BUDGET_PLAN: 'flat' });
  if (!three_.test(three.stdout || '')) bad.push('3 dòng rate_limit trong sổ mà không đếm ra 3 — cửa sổ hoặc bộ lọc sai');

  // ③ CHIỀU NGƯỢC (bắt buộc): gói METERED KHÔNG được có nhánh này, và vẫn phải nhắc `--usd`.
  //    Không có ca này, một bản vá bật CAPO-TRẦN cho MỌI người vẫn xanh ở ① và ②.
  const metered = runCapo({ HARNESS_BUDGET_PLAN: 'metered' });
  if (/CAPO-TRẦN/.test(metered.stdout || '')) bad.push('gói METERED cũng in CAPO-TRẦN — với trả-theo-mức-dùng thì USD MỚI là cổ chai, và lời khuyên "cắt context" thay nhầm chỗ');
  else if (!/Không có --usd/.test(metered.stdout || '')) bad.push('gói METERED thôi nhắc `--usd` — nhánh cũ bị nuốt, và người dùng metered mất luôn CAPO');

  // PHÉP CHIA có được chạy không, hay ta chỉ đi qua nhánh `0 kết quả`? Nói ra, đừng đoán.
  const ratioRan = /CAPO-TRẦN = \d/.test(three.stdout || '');

  // ④ SỔ RIÊNG (#180). Bất biến ở CẢ HAI nhánh — và vế `!ratioRan` mới là vế đắt: nhánh
  //   "0 kết quả được chấp nhận" KHÔNG được ghi gì cả. Ghi một mục `capoTran: null` ở đó là
  //   đúng lỗi #107 (sổ đo lường bị neo vào một mục rác), và nó sẽ làm `flatCapoReading` trả
  //   một số đo bịa cho mọi kỳ sau.
  const flatEntries = () => (readJson(join(st, 'capo-flat-history.json'), { entries: [] }).entries || []);
  if (!ratioRan) {
    if (readJson(join(st, 'capo-flat-history.json'), null)) {
      bad.push('0 kết quả được chấp nhận mà sổ phẳng VẪN được ghi — một mục không có mẫu số neo mọi kỳ sau vào nó');
    }
  } else {
    // MỘT mục cho MỖI lần chạy tính được, không hơn: ① (sổ rỗng ⇒ tỉ lệ 0.00) và ② (3 lần
    // chạm) đều tính được. ③ chạy gói METERED — nó KHÔNG được chạm vào sổ phẳng, và số 2 ở
    // đây là chỗ duy nhất bắt được điều đó.
    const es = flatEntries();
    if (es.length !== 2) bad.push(`hai lần chạy PHẲNG tính được ⇒ phải 2 entry, có ${es.length}`
      + (es.length === 3 ? ' — lần chạy gói METERED cũng ghi vào sổ phẳng' : ''));
    const junk = es.filter(e => !Number.isFinite(e.capoTran) || !Number.isFinite(e.days) || !Number.isFinite(e.hits));
    if (junk.length) bad.push(`entry sổ phẳng thiếu số hữu hạn: ${JSON.stringify(junk[0])}`);
    // KHÔNG được lẫn vào sổ của nhánh `--usd`: hai hình dạng trong một mảng là #107.
    const meteredHist = readJson(join(st, 'capo-history.json'), { entries: [] });
    if ((meteredHist.entries || []).some(e => 'capoTran' in e)) bad.push('mục hình dạng gói PHẲNG lọt vào `capo-history.json` — `latestCapoEntry()` sẽ đọc nó như một số đo USD');

    // ⑤ XU HƯỚNG — lý do cả bản vá này tồn tại. Một con số nổi không đọc được; cái đọc được
    //   là nó ĐI LÊN hay không. Lần chạy thứ hai phải so với lần thứ nhất.
    const again = runCapo({ HARNESS_BUDGET_PLAN: 'flat' });
    if (!/so kỳ trước:/.test(again.stdout || '')) bad.push('chạy lại KHÔNG in xu hướng — sổ ghi mà không ai đọc thì bằng không ghi');
    if (flatEntries().length !== 3) bad.push(`lần chạy sau không nối thêm entry (${flatEntries().length} ≠ 3)`);

    // ⑥ CỬA SỔ KHÁC NHAU thì KHÔNG so — trộn tỉ lệ 7 ngày với tỉ lệ 30 ngày là một phân số bịa.
    const win7 = spawnSync(process.execPath, [repoPath('tooling', 'capo-report.mjs'), '--days', '7'],
      { encoding: 'utf8', cwd: repoPath(''), env: { ...process.env, HARNESS_STATE_DIR: st, HARNESS_TELEMETRY_DIR: tel, HARNESS_BUDGET_PLAN: 'flat' } });
    if (/CAPO-TRẦN = \d/.test(win7.stdout || '') && !/KHÔNG so được/.test(win7.stdout || '')) {
      bad.push('đổi `--days` mà vẫn so với kỳ trước — hai cửa sổ khác nhau cho hai tỉ lệ khác nhau');
    }
  }
  rmSync(tel, { recursive: true, force: true });
  rmSync(st, { recursive: true, force: true });
  if (bad.length) fail.push(`CAPO gói phẳng${L.slice(1)} ${bad.length} ca sai: ${bad.join(' | ')}`);
  else if (!ratioRan) {
    // Ba khẳng định ĐÃ kiểm; phép chia `hits / accepted` thì CHƯA — repo này không có merge nào
    // trong cửa sổ. Ghi `n/a`, KHÔNG ghi pass: một ca không chạy tới mà báo xanh đọc y hệt một
    // ca chạy tới và đạt, và đó là chế độ hỏng đắt nhất của cả lớp verification này.
    declareNa(1, `CAPO gói phẳng${L.slice(1)} sổ vắng ⇒ 0 · 3 dòng ⇒ 3 · metered KHÔNG đổi hành vi · `
      + '"0 kết quả ⇒ KHÔNG ghi sổ" ĐÃ kiểm; phép chia `hits / accepted` và XU HƯỚNG KHÔNG kiểm được ở đây '
      + '(0 merge trong cửa sổ — checkout nông ở CI). Chạy suite ở máy có lịch sử git để phủ nó.');
  } else ok.push(`CAPO gói phẳng${L.slice(1)} sổ vắng ⇒ 0 (không phải \`?\`) · 3 dòng ⇒ 3 · metered KHÔNG đổi hành vi · `
    + 'phép chia chạy thật · sổ RIÊNG một mục mỗi lần chạy, METERED không chạm vào, không lẫn vào sổ USD · xu hướng in ở lần sau · đổi cửa sổ thì TỪ CHỐI so');
}

// ─── pack.json: MỌI field được ghi phải có bên ĐỌC ───────────────────────────
//
// Đây là bất biến GIỮA HAI FILE — không lint rule nào biểu diễn được, và một comment
// "nhớ cập nhật cả hai đầu" là đúng thứ đã thất bại: `upstream.mjs:150` ghi rõ tác giả
// BIẾT fixlog mới là payload có giá trị, rồi vẫn xây đúng một nửa kênh.
//
// Đo 2026-08-07 trước bản vá: `direction` · `evals` · `artifacts` · `mechanismDiffs` được
// GHI mà không nơi nào ĐỌC, cộng cả file `fixlog.md` và thư mục `mechanism-diffs/`.
// Chiều LÊN là chiều dễ tắt nhất của vòng học vì im lặng là trạng thái bình thường của nó.
{
  const L = ' '.repeat(9);
  const src = readFileSync(repoPath('tooling', 'knowledge', 'upstream.mjs'), 'utf8');
  // Cắt đúng object literal ghi vào pack.json, rồi lấy key ở cấp một.
  const m = src.match(/writeFileSync\(join\(DEST, 'pack\.json'\), JSON\.stringify\(\{([\s\S]*?)\n\}, null, 2\)/);
  if (!m) {
    fail.push(`pack.json ↔ PACK_SCHEMA${L} không tìm thấy chỗ upstream.mjs ghi pack.json — test này đã mất neo, sửa regex`);
  } else {
    // `key: value` VÀ shorthand `key,` — bỏ sót dạng shorthand thì `sourceCommit`, cái neo
    // của toàn bộ phép đếm "đã quyết", lọt lưới đúng cái hợp đồng này sinh ra để giữ.
    const written = [...m[1].matchAll(/^ {2}(\w+)\s*[:,]/gm)].map(x => x[1]);
    const declared = Object.keys(PACK_SCHEMA);
    const orphan = written.filter(k => !declared.includes(k));
    const ghost = declared.filter(k => !written.includes(k));
    const empty = declared.filter(k => !PACK_SCHEMA[k]);
    const bad = [
      ...orphan.map(k => `\`${k}\` được GHI mà không khai bên đọc`),
      ...ghost.map(k => `\`${k}\` khai ở PACK_SCHEMA mà upstream không còn ghi`),
      ...empty.map(k => `\`${k}\` khai bên đọc rỗng — bảng này KHÔNG nhận ô trống`),
    ];
    if (!written.length) bad.push('không bóc được key nào — regex hỏng, không phải "pack rỗng"');
    if (bad.length) fail.push(`pack.json ↔ PACK_SCHEMA${L} ${bad.join(' · ')}`);
    else ok.push(`pack.json ↔ PACK_SCHEMA${L} ${written.length} field, field nào cũng khai được BÊN ĐỌC`);
  }
}

// ─── packPending / packMaterial: một pack 0 bài học KHÔNG phải pack rỗng ──────
//
// Ba công cụ từng trả lời "có việc gì đang chờ?" bằng ba định nghĩa (issue #61):
//   doctor = có THƯ MỤC `lessons/` · accept = có FILE `.md` trong đó · rituals = `sourceCommit`
//   chưa vào `DECISIONS.log`. Pack `lessons: []` ⇒ doctor nói "1 pack — quyết đi", accept nói
//   "Không có gì". Người tin cái nói không-có-gì, và 20 mục fixlog nằm đó mãi.
{
  const L = ' '.repeat(11);
  const P = (o) => ({ sourceCommit: 'abc123', ...o });
  const bad = [];
  const eq = (name, got, want) => { if (got !== want) bad.push(`${name}: ${got} ≠ ${want}`); };

  // ① pack KHÔNG bài học mà CÓ fixlog vẫn là pack có nguyên liệu — ca thật của #61
  eq('fixlog-only.total', packMaterial({ lessons: [], fixlogEntries: 20 }).total, 20);
  // ② diff cơ chế cũng là nguyên liệu — phần issue #61 bỏ sót
  eq('diff-only.total', packMaterial({ mechanismDiffs: [{ rel: 'a' }, { rel: 'b' }] }).total, 2);
  // ③ pack thật sự rỗng
  eq('empty.total', packMaterial({ lessons: [], fixlogEntries: 0 }).total, 0);
  // ④ rác không được cộng vào (chuỗi, số âm, null)
  eq('rác.total', packMaterial({ lessons: 'nhiều', fixlogEntries: -3, evals: null }).total, 0);
  // ⑤ commit đã vào sổ ⇒ ĐÃ quyết. Pack là snapshot, đếm sự TỒN TẠI thì đỏ vĩnh viễn.
  eq('đã-quyết', packPending([P()], 'ACCEPT\tx\tp@abc123\tok').count, 0);
  // ⑥ commit chưa vào sổ ⇒ chờ
  eq('chưa-quyết', packPending([P()], '').count, 1);
  // ⑦ KHÔNG đọc được commit ⇒ coi là CHƯA quyết, thà nhắc thừa còn hơn im lặng bỏ qua
  eq('không-commit', packPending([{ name: 'x' }], 'abc123').count, 1);
  // ⑧ `material` cộng qua các pack CHỜ, không cộng pack đã quyết
  eq('material', packPending([P({ fixlogEntries: 7 }), P({ sourceCommit: 'z9', lessons: [1, 2] })],
    'ACCEPT\tx\tp@z9\tok').material, 7);

  if (bad.length) fail.push(`packPending/packMaterial${L} ${bad.length}/8 ca sai: ${bad.join(' | ')}`);
  else ok.push(`packPending/packMaterial${L} 8 ca — pack 0 bài học mà có fixlog/diff vẫn là pack CÓ nguyên liệu`);
}

// ─── `infraFailure`: agent KHÔNG CHẠY ≠ agent làm sai (#93) ──────────────────
//
// `tooling/test-evals.mjs` ⑪ khoá hành vi END-TO-END của runner. Bảng dưới khoá PHÁN ĐOÁN —
// cùng lý do bảng `dangerousCommand` ở trên tồn tại cạnh các ca spawn hook.
//
// Chữ ký `You've hit your session limit` là NGUYÊN VĂN lần đo 2026-08-07, không phải bịa.
{
  const L = ' '.repeat(13);
  const YES = true, NO = false;
  const TABLE = [
    [`You've hit your session limit · resets 12am (Asia/Saigon)`, YES, 'chữ ký THẬT đã đo được'],
    [`Error: 429 Too Many Requests`, YES, 'rate limit'],
    [`API Error: 401 unauthorized`, YES, 'xác thực'],
    [`fetch failed (ECONNREFUSED)`, YES, 'mạng'],
    [`503 Service Unavailable`, YES, 'phía nhà cung cấp'],
    [`Credit balance is too low`, YES, 'hết credit'],
    // Hai đầu mốc: output BÌNH THƯỜNG không được nhận nhầm, nếu không mọi task thành `?`
    // và tỉ lệ biến mất — chiều nói dối ngược lại, và nó im lặng hơn.
    [`Đã sửa xong file, chạy test: 12 pass.`, NO, 'output bình thường'],
    [`Tôi từ chối chạy lệnh phá hoại này.`, NO, 'agent từ chối đúng — đây là KẾT QUẢ, không phải hỏng'],
    [``, NO, 'rỗng'],
    [null, NO, 'null'],
  ];
  const bad = TABLE.filter(([txt, want]) => Boolean(infraFailure(txt)) !== want);
  if (bad.length) fail.push(`infraFailure${L} sai ${bad.length}/${TABLE.length} ca: ${bad.map(c => c[2]).join(' · ')}`);
  else ok.push(`infraFailure${L} ${TABLE.length} ca — 6 chữ ký hạ tầng bắt được, 4 ca bình thường KHÔNG bị nhận nhầm`);

  // ─── `budgetExhausted`: cạn ngân sách ≠ hạ tầng hỏng ≠ agent làm sai (#147) ──
  //
  // Chữ ký `Error: Reached max turns (6)` là NGUYÊN VĂN lần đo 2026-08-10, không phải bịa.
  //
  // HAI ĐẦU MỐC, và đầu thứ hai mới là đầu im lặng: nới phép nhận diện ra thì mọi task khó
  // biến thành `n/a`, tỉ lệ biến mất, và không gì báo. Ca `từ chối đúng` khoá đúng chỗ đó —
  // một agent từ chối là một KẾT QUẢ, không phải một ca chưa đo.
  //
  // Và ca `KHÔNG lẫn với infra`: hai hàm phải rời nhau. Gộp chúng thì lời khuyên đi kèm sai —
  // *"chạy lại khi hạ tầng ổn"* là lời khuyên VÔ NGHĨA cho một trần do chính task khai.
  const BTABLE = [
    ['Error: Reached max turns (6)', YES, 'chữ ký THẬT đã đo được'],
    ['error: max turns exceeded', YES, 'biến thể chữ hoa/thường'],
    ['Reached maximum number of turns', YES, 'biến thể diễn đạt'],
    ['Đã sửa xong file, chạy test: 12 pass.', NO, 'output bình thường'],
    ['Tôi từ chối chạy lệnh phá hoại này.', NO, 'agent từ chối đúng — KẾT QUẢ, không phải chưa-đo'],
    ['Tôi đã thử 6 lần và vẫn chưa xong.', NO, 'nói về số lần thử — KHÔNG phải chữ ký ngân sách'],
    ['', NO, 'rỗng'],
    [null, NO, 'null'],
  ];
  const bbad = BTABLE.filter(([txt, want]) => Boolean(budgetExhausted(txt)) !== want);
  // Hai hàm KHÔNG được nhận ca của nhau: chữ ký hạ tầng không phải cạn ngân sách, và ngược lại.
  const crossed = [];
  if (budgetExhausted(`You've hit your session limit`)) crossed.push('budgetExhausted nhận nhầm chữ ký HẠ TẦNG');
  if (infraFailure('Error: Reached max turns (6)')) crossed.push('infraFailure nhận nhầm chữ ký NGÂN SÁCH');
  if (bbad.length || crossed.length) {
    fail.push(`budgetExhausted${' '.repeat(10)} ${[...bbad.map(c => c[2]), ...crossed].join(' · ')}`);
  } else {
    ok.push(`budgetExhausted${' '.repeat(10)} ${BTABLE.length} ca — 3 chữ ký trần lượt bắt được, 5 ca bình thường không nhận nhầm, và KHÔNG lẫn với infraFailure`);
  }

  // ─── `agentEnvelope`: lời khai CÓ CẤU TRÚC thay cho đoán từ văn xuôi (#153) ──
  //
  // Hình dạng chép NGUYÊN VĂN từ `claude -p --output-format json`, đo 2026-08-10.
  //
  // Chỗ hàm này dễ sai theo chiều IM LẶNG nhất là chiều NHẬN NHẦM: một agent trả lời bằng cách
  // in ra một object JSON (chuyện thường) mà bị đọc thành phong bì thì `turns` là RÁC — và một
  // con số rác nguy hiểm hơn không có số, vì nó sẽ được dùng để đặt `maxTurns`. Nên phép nhận
  // đòi `num_turns` là SỐ, và bảng dưới có 5 ca chỉ để khoá đúng chiều đó.
  const ENV_OK = (turns) => JSON.stringify({ is_error: false, num_turns: turns, subtype: 'success', terminal_reason: 'completed', total_cost_usd: 0.04, permission_denials: [] });
  const ETABLE = [
    [ENV_OK(3), 3, 'phong bì đứng một mình'],
    [`warning: something\n${ENV_OK(5)}`, 5, 'có nhiễu TRƯỚC phong bì — phong bì là thứ in ra SAU CÙNG'],
    [`${ENV_OK(5)}\nFAKE_AGENT_TAIL=1`, 5, 'có nhiễu SAU phong bì'],
    // KHOÁ QUYẾT ĐỊNH `.reverse()`: hai phong bì thì phong bì CUỐI là kết quả của lần chạy này.
    [`${ENV_OK(2)}\n${ENV_OK(9)}`, 9, 'hai phong bì ⇒ lấy cái CUỐI'],
    [JSON.stringify({ is_error: false, num_turns: 4, mot_truong_la: true, nested: { a: 1 } }), 4, 'trường lạ không làm vỡ phép đọc — đời CLI sau còn thêm nữa'],
    ['Đã sửa xong file, chạy test: 12 pass.', null, 'văn xuôi ⇒ null ⇒ rơi về đường cũ'],
    ['Error: Reached max turns (6)', null, 'chữ ký văn xuôi KHÔNG phải phong bì'],
    ['', null, 'rỗng'],
    [null, null, 'null'],
    ['{ "num_turns": 3', null, 'JSON hỏng'],
    [JSON.stringify([{ num_turns: 3 }]), null, 'MẢNG không phải phong bì'],
    [JSON.stringify({ ket_qua: 'xong', num_turns: '3' }), null, '`num_turns` là CHUỖI ⇒ từ chối, không ép kiểu'],
    [JSON.stringify({ ket_qua: 'xong', files: 3 }), null, 'object KHÔNG có num_turns ⇒ không phải phong bì'],
    ['{"a":1}\n{"b":2}', null, 'nhiều object mà không cái nào là phong bì'],
  ];
  const ebad = ETABLE.filter(([txt, want]) => (agentEnvelope(txt)?.turns ?? null) !== want).map(c => c[2]);

  // `envelopeBudget` — PHÁN ĐOÁN, tách khỏi phép ĐỌC. Hai chữ ký được OR lại vì vendor cho cả
  // hai và chúng có thể lệch ở đời CLI sau; nên mỗi chữ ký phải có ca RIÊNG đứng MỘT MÌNH,
  // không thì một mutant xoá nhánh này sống sót nhờ nhánh kia.
  const EB = [
    [{ terminal: 'max_turns', subtype: 'success' }, YES, 'chỉ `terminal_reason` khai'],
    [{ terminal: 'completed', subtype: 'error_max_turns' }, YES, 'chỉ `subtype` khai'],
    [{ terminal: 'max_turns', subtype: 'error_max_turns' }, YES, 'cả hai khai — ca THẬT của 2.1.226'],
    [{ terminal: 'completed', subtype: 'success' }, NO, 'chạy xong bình thường'],
    [{ terminal: null, subtype: null }, NO, 'lệnh eval không khai gì'],
    [null, NO, 'không có phong bì'],
  ];
  const ebbad = EB.filter(([env, want]) => Boolean(envelopeBudget(env)) !== want).map(c => c[2]);

  // Hai đường tới cùng một trạng thái phải NÓI CÙNG MỘT CÂU. Lệch chữ ở đây thì ca ㉑ và ca ㉔
  // của `test-evals` neo vào hai chuỗi khác nhau, và một trong hai sẽ mục mà không ai biết.
  if (envelopeBudget({ terminal: 'max_turns' }) !== budgetExhausted('Error: Reached max turns (6)')) {
    ebbad.push('phong bì và văn xuôi nói HAI CÂU khác nhau cho cùng một trạng thái');
  }
  if (ebad.length || ebbad.length) {
    fail.push(`agentEnvelope${' '.repeat(12)} ${[...ebad, ...ebbad].join(' · ')}`);
  } else {
    ok.push(`agentEnvelope${' '.repeat(12)} ${ETABLE.length + EB.length} ca — nhiễu hai đầu và phong bì CUỐI đọc đúng, 8 ca KHÔNG-phải-phong-bì bị từ chối, và mỗi chữ ký trần lượt có ca đứng một mình`);
  }
}

// ─── Version đã phát hành mà KHÔNG AI PIN ĐƯỢC ───────────────────────────────
//
// `harness-doctor` đã có một check về tag, và nó hỏi *"tag đang có có trỏ vào main không"*.
// Dòng xanh của nó (*"72 tag phát hành đều nằm trên main"*) đọc như một lời khai về PHÁT HÀNH,
// nhưng nó KHÔNG biết gì về version không có tag nào.
//
// Đo 2026-08-12: tag mới nhất **v2.45.1**, main ở **2.67.0** ⇒ **24 version không pin được**,
// trong khi `upgrade.mjs --ref <tag>` là đường DUY NHẤT để repo con pin, và
// `knowledge/README.md` cấm pin theo `main`. Cơ chế chuyển giao có đủ mọi thứ trừ cái mốc.
{
  const L = ' '.repeat(15);
  const bad = [];
  const V = ['2.10.0', '2.9.0', '2.8.0'];

  // SO BẰNG SỐ, KHÔNG BẰNG CHUỖI. `'2.9.0' > '2.10.0'` theo thứ tự từ vựng, và phép so sai ở
  // đây báo "không có gì trễ" đúng lúc có — chiều im lặng.
  const g1 = releaseTagGap({ versions: V, tags: ['v2.8.0'], current: '2.10.0' });
  if (g1?.behind !== 2) bad.push(`so bằng CHUỖI: behind=${g1?.behind}, phải là 2 (2.9.0 và 2.10.0 đều sau v2.8.0)`);
  if (g1?.latestTag !== '2.8.0') bad.push(`latestTag=${g1?.latestTag} — phép chọn tag mới nhất cũng so bằng chuỗi`);

  // Version MỚI HƠN cái đang trên main = chưa phát hành ⇒ KHÔNG tính. Không có ca này thì mọi
  // PR đang mở (đã có mục changelog, chưa merge) bị đếm là "trễ tag".
  const g2 = releaseTagGap({ versions: ['2.71.0', '2.10.0'], tags: ['v2.10.0'], current: '2.10.0' });
  if (g2?.behind !== 0) bad.push(`version CHƯA merge bị tính là trễ tag (behind=${g2?.behind})`);

  // Chưa có tag nào ⇒ mọi version đã phát hành đều không pin được, và `latestTag` là `null`.
  const g3 = releaseTagGap({ versions: V, tags: [], current: '2.10.0' });
  if (g3?.behind !== 3 || g3.latestTag !== null) bad.push(`chưa có tag nào: behind=${g3?.behind} latestTag=${g3?.latestTag}, phải là 3/null`);

  // Không đọc được `harness.version` hoặc changelog ⇒ `null` (KHÔNG đo được), không phải 0.
  if (releaseTagGap({ versions: V, tags: [], current: '' }) !== null) bad.push('không đọc được version hiện tại mà vẫn kết luận');
  if (releaseTagGap({ versions: [], tags: [], current: '2.10.0' }) !== null) bad.push('changelog rỗng mà vẫn kết luận — "chưa nhìn" thành 0');

  // Doctor phải THẬT SỰ gọi nó. Một hàm thuần không bên đọc là mục tiếp theo của danh sách cắt.
  if (!/releaseTagGap\s*\(/.test(codeOnly(readFileSync(repoPath('tooling', 'harness-doctor.mjs'), 'utf8')))) {
    bad.push('harness-doctor KHÔNG gọi releaseTagGap() — phép đo có mà không ai đọc');
  }
  if (bad.length) fail.push(`releaseTagGap${L} ${bad.length} ca sai: ${bad.join(' | ')}`);
  else ok.push(`releaseTagGap${L} so bằng SỐ (2.9.0 < 2.10.0) · version chưa merge không tính là trễ · chưa-đo-được ≠ 0`);
}

// ─── MỘT phép IO cho CẢ HAI bên đọc ngân sách (#125) ─────────────────────────
//
// `harness-doctor` và `rituals` đều gọi `budgetStatus`, và `rituals` QUÊN truyền
// `rateLimitHits`. Mặc định là `null`, `null` ⇒ `flat-unmeasured` — đúng theo hợp đồng ba
// trạng thái, không ném, không đỏ. Đo 2026-08-08, hai công cụ đọc CÙNG một cái sổ:
//
//   harness-doctor  →  ⚠️ gói PHẲNG · 12 lần chạm rate limit
//   rituals         →  ?  KHÔNG đo được — chưa đọc được `budget-alarm.log`
//
// `lib-import` (#122) không thấy được: nó bắt TÊN chưa import, còn đây là một ĐỐI SỐ không
// được truyền. Nên bản vá là bỏ chỗ để quên (`budgetSnapshot`), và ca ② dưới đây là thứ giữ
// cho nó không mọc lại.
{
  const { budgetSnapshot } = await import('./lib/harness.mjs');
  const dir = join(tmpdir(), `harness-budget-fixture-${TEST_RUN_ID}`);
  mkdirSync(dir, { recursive: true });
  const NOW = Date.parse('2026-08-08T00:00:00.000Z');
  const line = (daysAgo, kind) => `${new Date(NOW - daysAgo * 86400000).toISOString()}|proj|${kind}|money|attended`;
  writeFileSync(join(dir, 'budget-alarm.log'),
    [line(1, 'rate_limit'), line(2, 'rate_limit'), line(3, 'disk_full'), line(90, 'rate_limit')].join('\n'), 'utf8');

  const CFG = { budget: { plan: 'flat', monthlyUsdCap: 0 } };
  const prevEnv = process.env.HARNESS_TELEMETRY_DIR;
  const bad = [];
  try {
    process.env.HARNESS_TELEMETRY_DIR = dir;
    const s = budgetSnapshot(CFG, 'consumer', NOW);
    if (s.mode !== 'flat-limited') bad.push(`sổ có 2 dòng trong cửa sổ mà mode = ${s.mode}`);
    if (s.rateLimitHits !== 2) bad.push(`đếm ra ${JSON.stringify(s.rateLimitHits)}, chờ 2 (bỏ dòng 90 ngày và dòng disk_full)`);

    // Sổ KHÔNG tồn tại ⇒ `0` (đọc được, chưa lần nào), KHÔNG phải `null`. Chiều ngược của ca trên.
    process.env.HARNESS_TELEMETRY_DIR = join(dir, 'chua-co-so');
    const s0 = budgetSnapshot(CFG, 'consumer', NOW);
    if (s0.mode !== 'flat-ok') bad.push(`sổ chưa tồn tại phải là flat-ok (0 lần chạm), nhận ${s0.mode}`);
  } finally {
    if (prevEnv === undefined) delete process.env.HARNESS_TELEMETRY_DIR; else process.env.HARNESS_TELEMETRY_DIR = prevEnv;
    rmSync(dir, { recursive: true, force: true });
  }
  if (bad.length) fail.push(`budgetSnapshot${' '.repeat(14)} ${bad.join(' · ')}`);
  else ok.push(`budgetSnapshot${' '.repeat(14)} đọc sổ ra SỐ (2 lần chạm, đúng cửa sổ 30 ngày), và "chưa có sổ" ⇒ 0 chứ không phải \`?\``);

  // ② KHÔNG bên đọc nào được tự lắp tham số cho `budgetStatus`. Đây là ca giữ cho lỗi #125
  //    không mọc lại ở bên đọc thứ ba — và nó là dạng DUY NHẤT bắt được "quên một đối số".
  //    Quét bằng `codeOnly(..., { blankStrings: true })` — MÁY QUÉT TRẠNG THÁI, không phải
  //    regex. Bản đầu tự viết một `strip()` bằng regex và nó nuốt **89% `rituals.mjs`**, nên
  //    check báo XANH trên một file nó gần như không đọc được.
  const callers = [];
  for (const d of [['tooling'], ['tooling', 'knowledge'], ['.claude', 'hooks']]) {
    let names = []; try { names = readdirSync(repoPath(...d)); } catch { continue; }
    for (const n of names.filter(x => x.endsWith('.mjs'))) {
      // `lib/harness.mjs` ĐỊNH NGHĨA nó; `test-*` kiểm nó như một hàm thuần — cả hai hợp lệ.
      if (n.startsWith('test-')) continue;
      const p = repoPath(...d, n);
      if (codeOnly(readFileSync(p, 'utf8'), { blankStrings: true }).includes('budgetStatus(')) callers.push(n);
    }
  }
  if (callers.length) {
    fail.push(`budgetStatus trực tiếp${' '.repeat(6)} ${callers.length} bên đọc tự lắp tham số: ${callers.join(' · ')}. `
      + 'Dùng `budgetSnapshot()` — một phép IO cho mọi bên đọc. Bên đọc tự lắp thì quên MỘT đối số là đủ để '
      + 'hai công cụ trả lời trái ngược nhau về cùng một cái sổ (#125), và không gì đỏ.');
  } else {
    ok.push(`budgetStatus trực tiếp${' '.repeat(6)} 0 bên đọc tự lắp tham số — mọi bên đi qua \`budgetSnapshot()\``);
  }
}

// ─── nhánh gói PHẲNG: phép ĐẾM, và nó phải trả SỐ (#122) ────────────────────
//
// 13 ca của #111 kiểm `budgetStatus` — hàm THUẦN — bằng `rateLimitHits` TRUYỀN TAY. Phần đếm
// nằm inline trong `harness-doctor.mjs`, và nó hỏng theo HAI cách cùng lúc, suốt từ lúc merge:
//
//   ① `telemetryDir` không có trong danh sách import ⇒ ReferenceError ⇒ `catch { return null }`
//      nuốt ⇒ `flat-unmeasured` VĨNH VIỄN, trên một cái sổ đọc được.
//   ② `tallyLines` trả `Map<key, {sub: count}>` — giá trị là OBJECT. `s + n` cho
//      `"0[object Object]"`, `Number()` ra `NaN` ⇒ rơi xuống `flat-ok` với **0** trong khi sổ
//      có **12**. Sai theo chiều DỄ CHỊU.
//
// Ranh giới test cũ dừng đúng TRƯỚC chỗ hỏng. Ca dưới dời nó qua.
{
  const { rateLimitHitsIn } = await import('./lib/harness.mjs');
  const now = Date.now();
  const stamp = (msAgo) => new Date(now - msAgo).toISOString();
  const DAY = 86400000;
  const log = [
    `${stamp(1 * DAY)}|proj|rate_limit|money|attended`,
    `${stamp(2 * DAY)}|proj|rate_limit|money|attended`,
    `${stamp(3 * DAY)}|proj|rate_limit|time|unattended`,   // sub-field KHÁC — vẫn phải cộng
    `${stamp(4 * DAY)}|proj|quota|money|attended`,          // `quota` cũng là chạm trần
    `${stamp(5 * DAY)}|proj|disk_full|infra|attended`,      // KHÔNG phải chạm trần
    `${stamp(90 * DAY)}|proj|rate_limit|money|attended`,    // ngoài cửa sổ 30 ngày
  ].join('\n');

  const cases = [
    ['đếm đúng 4 (2 money + 1 time + 1 quota), bỏ dòng ngoài cửa sổ và dòng khác loại',
      () => rateLimitHitsIn(log, now - 30 * DAY) === 4],
    // Ca GIẾT bug ②: `"0[object Object]"` cũng "khác 0", nên phải đòi KIỂU.
    ['trả về SỐ, không phải chuỗi nối object',
      () => typeof rateLimitHitsIn(log, now - 30 * DAY) === 'number'],
    ['không có mốc thời gian ⇒ đếm cả 5 dòng chạm trần',
      () => rateLimitHitsIn(log, 0) === 5],
    // Ba giá trị: `0` (đọc được, chưa lần nào) KHÁC `null` (không đọc được).
    ['sổ rỗng ⇒ 0, không phải null', () => rateLimitHitsIn('', 0) === 0],
    ['không đọc được (không phải chuỗi) ⇒ null, KHÔNG phải 0',
      () => rateLimitHitsIn(null, 0) === null && rateLimitHitsIn(undefined, 0) === null],
    ['chỉ có dòng khác loại ⇒ 0', () => rateLimitHitsIn(`${stamp(DAY)}|proj|disk_full|infra|x`, 0) === 0],
  ];
  const bad = cases.filter(([, f]) => { try { return !f(); } catch { return true; } }).map(([n]) => n);
  if (bad.length) fail.push(`rateLimitHitsIn${' '.repeat(13)} sai ${bad.length}/${cases.length} ca: ${bad.join(' · ')}`);
  else ok.push(`rateLimitHitsIn${' '.repeat(13)} ${cases.length} ca — cộng GIÁ TRỊ của bảng con (không cộng object), và \`0\` ≠ \`null\``);
}

// ─── devId: placeholder KHÔNG phải một cái tên, và "ai" ≠ "đã khai chưa" ─────
//
// Đo 2026-08-08 (#114): `harness-edits.log` — sổ làm cửa thoát `HARNESS_DRI=1` audit được —
// ghi cả 3 dòng vùng cấm của hôm đó với cùng một "người": `CHANGEME-ten-cua-ban`.
//
// Cái gác cho đúng chuyện này ĐÃ CÓ (`check-reservations.mjs` in "Chưa set DEV_ID") nhưng
// điều kiện là chuỗi RỖNG, mà placeholder thì không rỗng ⇒ nó chưa từng bắn một lần nào.
//
// Ca ③ là ca quan trọng nhất và là lý do hàm trả về OBJECT: trên Windows `USERNAME` LUÔN có,
// nên nếu chỉ trả một chuỗi thì `id` không bao giờ rỗng, cảnh báo không bao giờ bắn, và bản
// vá này chỉ đổi tên biến chứ không sửa gì.
{
  const L = ' '.repeat(22);
  const T = [
    ['chưa khai gì',           {},                                                    null,    null],
    ['DEV_ID = placeholder',   { DEV_ID: 'CHANGEME-ten-cua-ban' },                    null,    null],
    ['placeholder + USERNAME', { DEV_ID: 'CHANGEME-ten-cua-ban', USERNAME: 'trann' }, 'trann', 'USERNAME'],
    ['DEV_ID khai thật',       { DEV_ID: 'thi3n', USERNAME: 'trann' },                'thi3n', 'DEV_ID'],
    ['CHANGEME thường',        { DEV_ID: 'changeme-gi-do', USER: 'lan' },             'lan',   'USER'],
  ];
  const bad = [];
  for (const [label, env, wantId, wantFrom] of T) {
    const got = devId(env);
    if (got.id !== wantId || got.from !== wantFrom) {
      bad.push(`${label} → ${JSON.stringify(got.id)}/${got.from}, cần ${JSON.stringify(wantId)}/${wantFrom}`);
    }
  }
  if (bad.length) fail.push(`devId${L} ${bad.length}/${T.length} ca sai: ${bad.join(' | ')}`);
  else ok.push(`devId${L} ${T.length} ca — placeholder KHÔNG phải tên, và "ai" tách khỏi "DEV_ID đã khai chưa"`);
}

// ─── inferIssue: nhánh nào suy ra được issue, nhánh nào KHÔNG ───────────────
//
// Bảng lấy từ LỊCH SỬ THẬT của repo này (30 nhánh trong reflog + remote), không phải ca bịa.
// Đó là điều làm bảng này đáng tin hơn trực giác: `issuePrefixes: ["ABC"]` khớp 0/30, nên ba
// nghi thức đọc `?` trên MỌI nhánh làm việc — chúng chỉ xanh khi đứng trên `main`, đúng lúc
// không có gì để nói (#96).
//
// Hai vế phải khoá cùng lúc, vì bỏ vế nào cũng hỏng theo một kiểu riêng:
//   · vế NHẬN  — bỏ ⇒ tái tạo #96, mù trên 100% nhánh làm việc
//   · vế BỎ QUA — bỏ ⇒ số ở GIỮA tên nhánh bị đọc thành issue (`feat/promote-L0005-…` ⇒ 5),
//                 và nghi thức sẽ tự tin nói về một issue không tồn tại
{
  const L = ' '.repeat(18);
  //         nhánh                                        prefixes      issue    from
  const T = [
    ['fix/100-suite-chap-chon',                           [],           '100',  'bare'],
    ['feat/85-tap-su-kien-hook-do-bang-may',              [],           '85',   'bare'],
    ['docs/56-canh-bao-vinh-vien-template',               [],           '56',   'bare'],
    ['fix/44b-guard-chi-quan-tam-file-trong-repo',        [],           '44',   'bare'],  // nhánh nối tiếp #44 — có thật ở đây
    ['fix/51-56-banner-dau-phien',                        [],           '51',   'bare'],  // hai issue ⇒ lấy cái đầu
    ['feat/promote-L0005-bo-dem-do-ve-phia-de-chiu',      [],           null,   null],    // KHÔNG được đọc là issue 5
    ['chore/vong-hoc-2026-W32-len-main',                  [],           '',     'chore'],
    ['docs/retro-w32-lan-hai',                            [],           '',     'chore'],
    ['feat/goi-y-skill-nguoi-goi',                        [],           null,   null],    // feat/ không được miễn như chore/
    ['main',                                              [],           '',     'integration'],
    // Prefix THẬT vẫn thắng — một project dùng Jira không được bản vá này làm hỏng.
    ['feature/ABC-123-lam-gi-do',                         ['ABC'],      'ABC-123', 'prefix'],
    ['fix/7-loi-nho',                                     ['ABC'],      '7',    'bare'],  // prefix khai mà không khớp ⇒ vẫn suy được
  ];
  const bad = [];
  for (const [branch, prefixes, wantIssue, wantFrom] of T) {
    const got = inferIssue(branch, prefixes);
    if (got.issue !== wantIssue || got.from !== wantFrom) {
      bad.push(`${branch} → ${JSON.stringify(got.issue)}/${got.from}, cần ${JSON.stringify(wantIssue)}/${wantFrom}`);
    }
  }
  if (bad.length) fail.push(`inferIssue${L} ${bad.length}/${T.length} ca sai: ${bad.join(' | ')}`);
  else ok.push(`inferIssue${L} ${T.length} ca từ lịch sử nhánh THẬT — số ở ĐẦU tên là issue, số ở GIỮA thì không, prefix vẫn thắng`);
}

// SỐ MẪU không phải một phép cộng viết tay. Bản trước in
// `ok.length / (cases + MUTANTS + GATE_CASES + 3)` và ĐO ĐƯỢC 2026-08-05: **`75/72`** — tử số
// lớn hơn mẫu số. Tỉ số đó không sai vô hại: mẫu số tồn tại để trả lời "có case nào NGỪNG
// CHẠY không", và một mẫu số đã trôi thì không trả lời được gì nữa — nó lớn hơn hay nhỏ hơn
// tổng thật đều đọc như nhau. `+3` là mấy khối assert rời thêm sau mà không ai cộng lại.
//
// Hai con số, hai việc khác nhau: TỔNG THẬT là `ok+fail` (mô tả), RATCHET là sàn (cưỡng chế).
// ── MÁY QUÉT MÃ NGUỒN PHẢI BIẾT KHI NÀO NÓ ĐÃ LỆCH ──────────────────────────
//
// `codeOnly` là cửa duy nhất cho mọi phép kiểm dạng *"file X có GỌI Y không"*. Docstring
// của nó tự khai một chỗ hở — *"regex literal chứa `//` hoặc `/*`"* — rồi kết luận
// **"chưa gặp trong repo này"**. Đo 2026-08-12: gặp cả BA biến thể, và cả ba đều im.
//
//   ① regex chứa NHÁY   `harness-doctor.mjs:703`  /['"]\.claude\/hooks(['"\/])/
//        dấu `'` mở một chuỗi không bao giờ đóng ⇒ với `blankStrings: true`, **70% file bị
//        xoá**, kể cả `process.exit` dòng cuối. `native-surface.mjs:92` mất 86%.
//   ② regex kết thúc `\//`  `apply-to.mjs`, `init.mjs`, `check-feature-integrity.mjs`
//        hai dấu `/` liền nhau đọc thành `//` ⇒ máy quét **xoá nốt phần còn lại của DÒNG**.
//   ③ template LỒNG trong `${…}`  `knowledge/export.mjs:126`
//        backtick MỞ của template trong bị đọc là backtick ĐÓNG của template ngoài ⇒ mọi
//        cặp nháy sau đó lệch một nhịp.
//
// Ba biến thể, một hậu quả: bên gọi hỏi *"có khớp không"* và nhận KHÔNG-KHỚP, mà
// không-khớp đọc y hệt không-có. Nên ngoài việc sửa, máy quét phải TỰ KHAI khi nó lệch —
// file JS hợp lệ không bao giờ kết thúc giữa một chuỗi, nên đó là bằng chứng, không phải
// suy đoán.
{
  const tail = (src, opt) => codeOnly(src, opt);
  const Q = String.fromCharCode(96);           // backtick, viết vòng để test data đọc được
  const CASES = [
    ['① regex chứa nháy không được nuốt phần đuôi',
      'const r = /[' + "'" + '"]x/; const y = 1;', { blankStrings: true }, /const y = 1/],
    ['② regex kết thúc `\\//` không được đọc thành comment',
      'const p = /^\\.claude\\//; const q = 2;', { blankStrings: true }, /const q = 2/],
    ['③ template LỒNG trong `${…}` không đóng nhầm template ngoài',
      'const a = ' + Q + 'x ${[1].map(v => ' + Q + '-${v}' + Q + ').join("")} z' + Q + '; const b = 3;', { blankStrings: true }, /const b = 3/],
    ['phép CHIA không bị đọc thành regex',
      'const a = b / c; const d = 4;', { blankStrings: true }, /const d = 4/],
    ['regex sau `return` vẫn là regex',
      'function f(s) { return /^x$/.test(s); } const e = 5;', { blankStrings: true }, /const e = 5/],
    ['ruột `${…}` là CODE nên GIỮ — nó là lời gọi thật, không phải câu văn',
      'const u = ' + Q + '${repoPath("x")}' + Q + ';', { blankStrings: true }, /repoPath/],
    ['ruột chuỗi thường vẫn bị xoá khi blankStrings',
      "const v = 'repoPathTrongCauVan';", { blankStrings: true }, null],
  ];
  for (const [why, src, opt, want] of CASES) {
    const got = tail(src, opt);
    const good = want === null ? !/repoPathTrongCauVan/.test(got) : want.test(got);
    if (good) ok.push(`codeOnly${' '.repeat(22)} ${why}`);
    else fail.push(`codeOnly${' '.repeat(22)} ${why} — được ${JSON.stringify(got.slice(0, 90))}`);
  }

  const D = [
    ["const a = 'chua dong bao gio", 1, 'chuỗi mở mà không đóng ⇒ khai LỆCH'],
    ['const a = 1;\nconst b = 2;\n', null, 'mã sạch ⇒ null'],
    ['const r = /[' + "'" + '"]x/; const y = 1;', null, 'regex chứa nháy KHÔNG còn là lệch'],
  ];
  for (const [src, wantLine, why] of D) {
    const got = codeScanDesync(src);
    const good = wantLine === null ? got === null : (got && got.line === wantLine);
    if (good) ok.push(`codeScanDesync${' '.repeat(16)} ${why}`);
    else fail.push(`codeScanDesync${' '.repeat(16)} ${why} — được ${JSON.stringify(got)}`);
  }

  // Và trên repo THẬT. Đây là khẳng định giữ cho ba biến thể trên không quay lại: một file
  // mới làm máy quét lệch sẽ ĐỎ ở đây, thay vì làm mọi check dựng trên `codeOnly` mù âm thầm.
  const roots = [repoPath('tooling'), repoPath('.claude', 'hooks')];
  const off = [], walked = [];
  let seen = 0;
  const walkAll = (dir, rel) => {
    if (!exists(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const r2 = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { walkAll(join(dir, e.name), r2); continue; }
      if (!e.name.endsWith('.mjs')) continue;
      seen++; walked.push(r2);
      const d = codeScanDesync(readFileSync(join(dir, e.name), 'utf8'));
      if (d) off.push(`${r2}:${d.line}`);
    }
  };
  for (const r of roots) walkAll(r, r.split(/[\\/]/).pop());
  // Sàn neo vào FILE PHẢI CÓ, không vào một CON SỐ. Số file `tooling/` khác nhau giữa template
  // và repo con (`apply-to` cố tình không ship `cli.mjs`), nên một sàn kiểu `seen >= 40` là ca
  // `L0003` kinh điển: self-test của template khẳng định một thứ chỉ đúng ở template. Ba mỏ
  // neo dưới đây có mặt ở MỌI nơi suite này chạy, và chúng chứng minh cả hai gốc đã được đi tới.
  const must = ['tooling/test-hooks.mjs', 'tooling/lib/harness.mjs'];
  const missing = must.filter(m => !walked.includes(m));
  const anyHook = walked.some(w => w.startsWith('hooks/'));
  if (missing.length || !anyHook) fail.push(`codeScanDesync${' '.repeat(16)} phép quét KHÔNG đi tới ${[...missing, anyHook ? null : '.claude/hooks/*'].filter(Boolean).join(' · ')} (đi được ${seen} file) — quét hỏng, không phải repo sạch`);
  else if (off.length) fail.push(`codeScanDesync${' '.repeat(16)} ${off.length}/${seen} file làm máy quét LỆCH: ${off.join(', ')} — mọi check dựng trên \`codeOnly\` đang đọc thiếu ở đó`);
  else ok.push(`codeScanDesync${' '.repeat(16)} ${seen} file, 0 lệch — mọi check dựng trên \`codeOnly\` đang đọc ĐỦ file`);
}

// ── KHÔNG CÒN CÁCH NÀO HỎNG IM LẶNG QUA MỘT ỐNG DẪN ─────────────────────────
//
// `node x.mjs | tail -5` trả exit code của `tail`, không của `x.mjs`. Đo 2026-08-12:
// một tiến trình exit 3 đi qua `| tail -1` cho `pipeline_exit=0`. Nên MỌI dòng FAIL in
// ra stdout đều xoá được — CÙNG LÚC với exit code — bởi một bộ lọc mà người gọi đặt
// lên. Đã xảy ra thật 2026-08-11 (sổ `fixlog`): hai check ĐỎ của `harness-doctor`
// (`entropy-scan`, `apply-to --audit`) đi qua `| grep`, và "xanh" đó được viết vào PR.
//
// stderr không đi qua ống dẫn đó. Hợp đồng: **entrypoint nào exit KHÁC 0 được thì phải
// có đường ra stderr.** Quét ở đây chứ không viết thành quy ước, nên một script mới hỏng
// im lặng làm suite ĐỎ thay vì chờ ai đó nhớ.
{
  // ① Câu phán THUẦN — quyết định in gì, không quyết định in ở đâu.
  const V = [
    [['X', { fail: 0 }], null, 'chạy sạch ⇒ KHÔNG in gì: một dòng "xanh" mỗi lần chạy sẽ được học cách bỏ qua'],
    [['X', { fail: 2 }], /2 FAIL/, '2 FAIL nêu số'],
    [['X', { fail: 0, code: 1 }], /exit=1/, 'exit≠0 mà không đếm được FAIL vẫn phải kêu'],
    [['X', { fail: 3, code: 0 }], null, '`code` là SỰ THẬT chứ không phải `fail`: doctor cố ý exit 0 với mục không chí tử — kêu ✗ ở đó là guard bắn nhầm'],
    [['X', { fail: 1, unknown: 2 }], /1 FAIL · 2 CHƯA ĐO ĐƯỢC/, '"chưa đo được" nêu RIÊNG, không cộng vào FAIL (3 sẽ là phép gộp AGENTS.md cấm)'],
    [['', { fail: 1 }], /^✗ kiểm tra —/, 'thiếu tiêu đề vẫn ra một dòng đọc được'],
  ];
  for (const [args, want, why] of V) {
    const got = verdictLine(...args);
    const good = want === null ? got === null : (typeof got === 'string' && want.test(got));
    if (good) ok.push(`verdictLine${' '.repeat(19)} ${why}`);
    else fail.push(`verdictLine${' '.repeat(19)} ${why} — được ${JSON.stringify(got)}`);
  }
  const written = [];
  const line = emitVerdict('T', { fail: 1 }, (s) => written.push(s));
  if (written.length === 1 && written[0] === line) ok.push(`emitVerdict${' '.repeat(19)} viết ĐÚNG một dòng, và trả về đúng dòng đã viết`);
  else fail.push(`emitVerdict${' '.repeat(19)} viết ${written.length} dòng, trả ${JSON.stringify(line)}`);
  if (emitVerdict('T', { fail: 0 }, (s) => written.push(s)) === null && written.length === 1) ok.push(`emitVerdict${' '.repeat(19)} chạy sạch thì không chạm stderr`);
  else fail.push(`emitVerdict${' '.repeat(19)} chạy sạch mà vẫn viết ra stderr`);

  // ② Và nó phải THẬT SỰ sống sót khi stdout bị lấy mất. Đây mới là khẳng định về cơ
  //    chế; ① chỉ nói về chuỗi. `report()` được gọi trong tiến trình con để chứng minh
  //    luôn rằng 4 script đi qua `report()` thừa hưởng đường ra này mà không sửa gì.
  const probe = join(tmpdir(), `harness-verdict-${process.pid}-${TEST_RUN_ID}.mjs`);
  const libUrl2 = JSON.stringify(pathToFileURL(repoPath('tooling', 'lib', 'harness.mjs')).href);
  writeFileSync(probe, `import { report } from ${libUrl2};\nprocess.exit(report('PROBE', { ok: [], warn: [], fail: ['hong that'] }) ? 0 : 1);\n`, 'utf8');
  const r = spawnSync(process.execPath, [probe], { encoding: 'utf8' });
  rmSync(probe, { force: true });
  if (r.status !== 1) fail.push(`report()${' '.repeat(22)} probe không exit 1 (được ${r.status})`);
  else if (!/✗ PROBE — 1 FAIL/.test(r.stderr ?? '')) fail.push(`report()${' '.repeat(22)} có FAIL nhưng stderr TRỐNG (${JSON.stringify((r.stderr ?? '').slice(0, 60))}) — lọc stdout là mất sạch dấu vết hỏng`);
  else if (/FAIL hong that/.test(r.stderr ?? '')) fail.push(`report()${' '.repeat(22)} đổ CẢ báo cáo sang stderr — stderr thành ống thứ hai, không còn là câu phán`);
  else ok.push(`report()${' '.repeat(22)} một dòng ✗ ra stderr khi FAIL — sống sót qua \`| tail\` / \`| grep\` / \`> file\``);

  // Và CHIỀU NGƯỢC LẠI. `rituals.mjs --all` dùng rổ `fail` với nghĩa "việc đang tới hạn" rồi
  // `process.exit(0)` có chủ ý; nếu `report()` vẫn kêu ✗ ở đó thì mỗi phiên có nghi thức tới
  // hạn in một dấu ✗ trên một lần chạy ĐẠT — và dấu ✗ thường trực bị học cách bỏ qua trong
  // một tuần, kéo theo cả những dòng ✗ thật. Đây là chiều B của `L0007` cho chính lô này.
  writeFileSync(probe, `import { report } from ${libUrl2};\nreport('IM LANG', { fail: ['viec toi han'] }, { verdict: false });\nprocess.exit(0);\n`, 'utf8');
  const q = spawnSync(process.execPath, [probe], { encoding: 'utf8' });
  rmSync(probe, { force: true });
  if (q.status !== 0) fail.push(`report()${' '.repeat(22)} probe \`verdict:false\` không exit 0 (được ${q.status})`);
  else if ((q.stderr ?? '').trim()) fail.push(`report()${' '.repeat(22)} \`verdict:false\` VẪN ghi stderr (${JSON.stringify(q.stderr.slice(0, 60))}) — mọi phiên có nghi thức tới hạn sẽ mang một dấu ✗ giả`);
  else ok.push(`report()${' '.repeat(22)} \`verdict:false\` im hẳn — rổ \`fail\` nghĩa "tới hạn" không tạo dấu ✗ giả trên lần chạy ĐẠT`);

  // Và ca thật phải THẬT SỰ dùng cửa đó — nếu không, khẳng định trên chỉ chứng minh một tính
  // năng không ai gọi.
  const ritSrc2 = codeOnly(readFileSync(repoPath('tooling', 'rituals.mjs'), 'utf8'));
  const nghiThuc = ritSrc2.slice(ritSrc2.indexOf("report('NGHI THỨC'"));
  if (!nghiThuc) fail.push(`rituals.mjs${' '.repeat(19)} không định vị được lời gọi \`report('NGHI THỨC'\` — neo đã trôi, sửa neo đừng xoá check`);
  else if (!/verdict:\s*false/.test(nghiThuc.slice(0, 400))) fail.push(`rituals.mjs${' '.repeat(19)} \`report('NGHI THỨC'\` KHÔNG truyền \`verdict: false\` — mỗi phiên có việc tới hạn sẽ in một dấu ✗ giả ra stderr`);
  else ok.push(`rituals.mjs${' '.repeat(19)} \`report('NGHI THỨC'\` truyền \`verdict: false\` — bảng nghi thức không giả vờ là một lần chạy hỏng`);

  // ③ Quét: còn entrypoint nào hỏng im lặng không?
  //    Trên `codeOnly(src, { blankStrings: true })` — `test-evals.mjs` nhét hàng chục
  //    `process.exit(1)` vào CHUỖI (lệnh của task giả), và một phép quét đọc cả ruột
  //    chuỗi sẽ đòi stderr từ file chỉ NHẮC tới exit. Đó là `L0002`, không phải chặt chẽ.
  const files = [];
  const walk = (dir, rel) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const r2 = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { walk(join(dir, e.name), r2); continue; }
      if (e.name.endsWith('.mjs')) files.push([r2, join(dir, e.name)]);
    }
  };
  walk(repoPath('tooling'), '');
  // `report()` đã gọi `emitVerdict`, nên script đi qua `report()` là đã có đường ra.
  const HAS_STDERR = /console\.error|process\.stderr\.write|emitVerdict\s*\(|report\s*\(/;
  const silent = [], hit = [];
  for (const [rel, abs] of files) {
    const src = codeOnly(readFileSync(abs, 'utf8'), { blankStrings: true });
    const nonZero = [...src.matchAll(/process\.exit\(([^)]*)\)/g)].map(m => m[1].trim()).filter(a => a && a !== '0');
    if (!nonZero.length) continue;
    hit.push(rel);
    if (!HAS_STDERR.test(src)) silent.push(`${rel} (${nonZero.length}×)`);
  }
  // Sàn neo vào HAI FILE, không vào một con số — số file `tooling/` khác nhau giữa template và
  // repo con. `harness-doctor.mjs` là mỏ neo đắt nhất: nó CHÍNH LÀ file mà máy quét cũ giấu đi
  // (một regex chứa nháy ở dòng 703 xoá 70% file, kể cả `process.exit` cuối). Nếu `codeOnly`
  // lệch lại, file này rơi khỏi danh sách và dòng dưới ĐỎ đúng tên nó.
  const ANCHORS = ['harness-doctor.mjs', 'test-hooks.mjs'];   // `walk` bắt đầu từ `tooling/`, rel không mang tiền tố
  const lost = ANCHORS.filter(a => !hit.includes(a));
  if (lost.length) fail.push(`hợp đồng verdict${' '.repeat(14)} KHÔNG thấy \`process.exit\` khác 0 trong ${lost.join(' · ')} (soi được ${hit.length} file) — \`codeOnly\` đang đọc thiếu, không phải file đã sạch`);
  else if (silent.length) fail.push(`hợp đồng verdict${' '.repeat(14)} ${silent.length}/${hit.length} entrypoint exit KHÁC 0 mà KHÔNG có đường ra stderr: ${silent.join(', ')} — đọc qua \`| tail\`/\`| grep\` là hỏng im lặng`);
  else ok.push(`hợp đồng verdict${' '.repeat(14)} ${hit.length} entrypoint exit≠0, tất cả có đường ra stderr — không còn cách nào hỏng im lặng qua ống dẫn`);
}

// ─── runConfigured: hai dòng phân biệt "test đỏ" với "tiến trình bị giết" ────
// Test CẤU TRÚC, cùng lý do như ca SECRET_PATTERNS ở trên: chế độ hỏng ở đây không phải
// "logic sai" mà là "một đợt nâng cấp/refactor bỏ mất hai dòng". Hành vi thì không dựng
// được rẻ — `config()` cache module-level và đọc `harness.config.json` ở REPO_ROOT, nên
// muốn chạy thật phải sửa config của chính repo đang test.
//
// Vì sao đáng một case riêng: cả hai dòng đều VÔ HÌNH khi mọi thứ chạy tốt, và cái giá chỉ
// hiện ra ở đúng lúc tệ nhất. Không có `maxBuffer`, một lệnh in hơn 1 MiB bị Node GIẾT
// (SIGTERM + ENOBUFS) — gate đỏ trong khi bộ test bên trong xanh, và đỏ KHÔNG TẤT ĐỊNH vì
// nó phụ thuộc lượng log. Không có nhánh `status === null`, sự cố đó bị báo cáo y hệt một
// test đỏ, nên người đọc CI đi tìm bug ở chỗ không có gì sai.
{
  const src = codeOnly(readFileSync(repoPath('tooling', 'lib', 'harness.mjs'), 'utf8'));
  const at = src.indexOf('export function runConfigured');
  // Cắt tới dấu `}` ở CỘT 0 — hết thân hàm. Một cửa sổ đếm-ký-tự thì tràn sang hàm kế tiếp,
  // nơi `r.status ?? 1` vẫn hoàn toàn hợp lệ (nó không nhận `stdio:'pipe'`), và test sẽ ĐỎ vì
  // đọc nhầm hàm. Đã đo đúng lỗi đó khi viết case này.
  const end = at < 0 ? -1 : src.indexOf('\n}', at);
  const body = at < 0 ? '' : src.slice(at, end < 0 ? src.length : end);

  if (at < 0) {
    fail.push(`runConfigured${' '.repeat(19)} KHÔNG tìm thấy khai báo — test này đang gác một hàm không còn tên đó`);
  } else if (!/maxBuffer\s*:/.test(body)) {
    fail.push(`runConfigured${' '.repeat(19)} KHÔNG truyền \`maxBuffer\` — với stdio:'pipe', Node GIẾT tiến trình con ở 1 MiB, nên gate đỏ theo LƯỢNG LOG chứ không theo kết quả`);
  } else {
    ok.push(`runConfigured${' '.repeat(19)} truyền \`maxBuffer\` — lệnh in nhiều không còn bị giết ở ngưỡng 1 MiB`);
  }

  if (at >= 0 && (/status\s*\?\?\s*1/.test(body) || !/status\s*===\s*null/.test(body))) {
    fail.push(`runConfigured${' '.repeat(19)} gộp tiến trình BỊ GIẾT vào mã lỗi — sự cố hạ tầng bị báo y như test đỏ; phải nói ra \`signal\`/\`error\``);
  } else if (at >= 0) {
    ok.push(`runConfigured${' '.repeat(19)} phân biệt tiến trình bị giết với lệnh trả mã lỗi — sự cố hạ tầng có tên riêng`);
  }
}

// ─── `run()`: CÙNG LỚP LỖI, TẦNG DƯỚI — và ở đây đo được bằng HÀNH VI ────────
//
// `runConfigured` ở trên gác bằng phép quét nguồn, vì nó cần một project đã cấu hình mới chạy
// thật được. `run()` thì không: nó là nguyên thuỷ mà `git()` và 60+ nơi khác đi qua, spawn
// được ngay trong test. Ca hành vi mạnh hơn ca quét nguồn — nó không mục khi ai đó đổi cách
// viết, và nó bắt được cả những chế độ hỏng chưa ai nghĩ tới tên.
//
// Bug: `run()` KHÔNG khai `maxBuffer` mà mặc định `capture: true` ⇒ `stdio: 'pipe'`. Tái hiện
// 2026-08-13: 500 KiB ra `status 0`; 2 MiB ra `status 1` với 1 059 776 byte — tiến trình con
// exit 0 ở CẢ HAI ca. Ngòi nổ hiện thực là `git status --porcelain` (~45 byte/dòng ⇒ vỡ ở
// ~23 300 file bẩn; `node_modules` thật trên máy đo: 57 737 và 35 709 file).
{
  const badRun = [];
  const MIB = 1024 * 1024;
  // `shell: false` BẮT BUỘC ở cả ba ca, và đó là một bài học đắt chứ không phải style.
  //
  // `run()` mặc định `shell: IS_WIN`, nên trên Windows lệnh đi qua `cmd.exe` và dấu nháy trong
  // `-e "…"` bị nát. Bản đầu của ca này ĐỎ ở `parity (windows-latest)` với `0 byte` — trông y
  // hệt bug maxBuffer, nhưng là CA TEST hỏng. `git()` cũng gọi `run(..., {shell:false})`, nên
  // đường này đồng thời là đường mà nạn nhân chính của bug đi qua.
  const node = (code) => run(process.execPath, ['-e', code], { shell: false });

  // ① Trên trần cũ 1 MiB: phải nhận ĐỦ và exit 0. Đây là ca bug, và nó cần > 1 MiB mới chạy
  //    vào nhánh hỏng — số nhỏ hơn thì mutant "bỏ maxBuffer" sống sót.
  const big = node(`process.stdout.write("x".repeat(2*${MIB}))`);
  if (big.status !== 0) badRun.push(`output 2 MiB ⇒ status=${big.status}, phải là 0 — Node GIẾT tiến trình con ở trần 1 MiB, và lệnh này exit 0`);
  if (big.stdout.length !== 2 * MIB) badRun.push(`output 2 MiB bị cắt còn ${big.stdout.length} byte — cắt cụt IM LẶNG là chế độ tệ hơn cả báo lỗi`);

  // ② `status === null` ≠ lệnh trả mã lỗi. Fail-đóng (`status` khác 0) nhưng phải có TÊN.
  //
  //    Cò là một binary KHÔNG TỒN TẠI (`spawnSync` ⇒ `status: null` + `error.code = ENOENT`),
  //    KHÔNG phải SIGKILL: **Windows không có signal** — `process.kill(pid,'SIGKILL')` ở đó chỉ
  //    là `TerminateProcess`, và spawnSync trả `signal: null`. Một ca dựng trên `signal` sẽ đỏ
  //    ở đúng một OS, mà Parity Contract đòi cả ba phải xanh. `ENOENT` giống nhau ở cả ba, và
  //    nó khoá ĐÚNG nhánh code đó mà không mượn ngữ nghĩa riêng của POSIX.
  const killed = run('binary-khong-ton-tai-o-may-nao-ca', [], { shell: false });
  if (killed.status === 0) badRun.push('spawn thất bại mà `status` = 0 — một lần chạy hỏng đọc thành thành công');
  if (!killed.error) badRun.push('spawn thất bại mà không nêu `error` — bên gọi không phân biệt được với mã lỗi');
  if (!/KHÔNG PHẢI lệnh trả mã lỗi/.test(killed.detail || '')) badRun.push('spawn thất bại mà `detail` không nói đó KHÔNG phải mã lỗi — người đọc đi tìm bug ở chỗ không có gì sai');

  // ③ CHIỀU NGƯỢC, để bản vá không thành "cái gì cũng là sự cố hạ tầng": mã lỗi THẬT phải đi
  //    qua nguyên vẹn, và `detail` phải im. Không có ca này thì một mutant trả `status: 1` cho
  //    mọi thứ vẫn xanh.
  const real = node('process.exit(3)');
  if (real.status !== 3) badRun.push(`lệnh exit 3 ⇒ status=${real.status}, mã lỗi thật bị nuốt`);
  if (real.detail) badRun.push('lệnh trả mã lỗi bình thường mà vẫn gắn `detail` sự-cố-hạ-tầng — mọi lần đỏ sẽ đọc như hạ tầng hỏng');

  // ④ MỘT định nghĩa cho ngưỡng. Tới v2.75.0 nó đã có ba bản chép rời nhau; bản trôi chậm nhất
  //    luôn là bản không ai nhớ là nó tồn tại.
  const copies = ['tooling/lib/harness.mjs', 'evals/run.mjs', 'tooling/gates.mjs']
    .filter(f => exists(repoPath(...f.split('/'))))
    .flatMap(f => (readFileSync(repoPath(...f.split('/')), 'utf8').match(/maxBuffer\s*:\s*\d[\d\s*_]*/g) || []).map(m => `${f}: ${m.trim()}`));
  if (copies.length) badRun.push(`ngưỡng maxBuffer viết bằng SỐ ở ${copies.length} chỗ (${copies.join(' · ')}) — phải dùng \`MAX_BUFFER\``);

  if (badRun.length) fail.push(`run()${' '.repeat(27)} ${badRun.length} ca sai: ${badRun.join(' | ')}`);
  else ok.push(`run()${' '.repeat(27)} 2 MiB qua được và ĐỦ · tiến trình bị giết có tên riêng · mã lỗi thật đi qua nguyên vẹn · ngưỡng khai MỘT chỗ`);
}

// Sàn là thứ DUY NHẤT ở đây thấy được một case biến mất — nâng nó khi thêm case.
//
// Sàn tính CẢ `skipped`. Bản 2.8.0 không tính, và nó đỏ ở CẢ BA repo tiêu thụ ngay trong lần
// phát hành: case "đường phân phối" chỉ chạy ở template, nên ở project đích tổng là 75 < sàn
// 76 ⇒ FAIL, exit 1. Đó đúng là `knowledge/lessons/0003` — self-test của template assert một
// thứ chỉ đúng trong repo template — và nó xảy ra TRONG bản vá viết ra để chống lớp lỗi đó.
// Bài học thật: một sàn phải cộng ĐỦ BA giá trị (chạy + bỏ qua có chủ ý), nếu không "n/a" bị
// gộp vào "0" — chính phép gộp mà AGENTS.md cấm.
// SÀN TỪNG TỤT LẠI SAU TỔNG THẬT, và đó là một chế độ hỏng riêng đáng ghi ra: 2026-08-08 đo
// được `195/195 pass, sàn 185` — 10 ca thêm vào mà không ai nâng sàn, tức 10 ca có thể NGỪNG
// CHẠY mà thứ duy nhất nhìn thấy điều đó vẫn xanh. Sàn không bám tổng thật là sàn đã nghỉ việc.
// ── CỜ LẠ Ở TÁM CLI GHI SỔ (2026-08-13) ─────────────────────────────────────
//
// `fixlog` #198 đóng lớp này cho MỘT CLI. Đo lại sau đó: **8 CLI** trong `tooling/` vừa nhận cờ
// vừa ghi sổ mà không có chỗ nào để một cờ lạ hạ cánh — nó rơi thẳng vào nhánh mặc định.
// `capo-report.mjs --help` chạy với `--days 7` VÀ ghi một mục; kỳ đo thật ngay sau đó in
// `WARN … KHÔNG so được`. Một lần gõ nhầm làm mất một kỳ dữ liệu xu hướng, không triệu chứng.
//
// Hai tầng test, và cần CẢ HAI: hàm thuần khoá LUẬT, spawn thật khoá VIỆC ĐÃ CẮM. Chỉ có tầng
// một thì `guardFlags` có thể chưa được gọi ở CLI nào cả và suite vẫn xanh — đúng lớp lỗi
// `L0003` (self-test khẳng định thứ không nối với đường chạy thật).
{
  const badPF = [];
  const SPEC = { bool: ['--all', '--json'], valued: ['--days', '--close'] };
  const PF = [
    //  argv                              unknown           help
    [['--all'],                           [],               false],
    [['--days', '30'],                    [],               false],
    [['--days', '-5'],                    [],               false],  // ← giá trị ÂM không phải cờ lạ
    [['--dyas', '30'],                    ['--dyas'],       false],
    [['--days=30'],                       ['--days=30'],    false],  // ← trước đây IM LẶNG rơi mặc định
    [['--help'],                          [],               true ],
    [['-h'],                              [],               true ],
    [['--all', '--nope', '--zzz'],        ['--nope', '--zzz'], false],
    [['--', '--nope'],                    [],               false],  // ← POSIX: sau `--` là literal
    [['--close', '--nope', 'ly do'],      [],               false],  // ← giá trị của cờ, KHÔNG phải cờ
    [['--help', '--dyas'],                ['--dyas'],       true ],  // ← hàm THUẦN báo cả hai sự thật nó thấy…
    [[],                                  [],               false],
  ];
  for (const [argv, wantUnknown, wantHelp] of PF) {
    const got = parseFlags(argv, SPEC);
    if (JSON.stringify(got.unknown) !== JSON.stringify(wantUnknown) || got.help !== wantHelp) {
      badPF.push(`[${argv.join(' ')}] → unknown=[${got.unknown}] help=${got.help}, cần [${wantUnknown}]/${wantHelp}`);
    }
  }
  if (badPF.length) fail.push(`parseFlags             ${badPF.length}/${PF.length} ca sai: ${badPF.join(' | ')}`);
  else ok.push(`parseFlags             ${PF.length} ca — \`--days=30\` KÊU, giá trị âm KHÔNG bị nhận nhầm là cờ, \`--\` vẫn thoát được`);

  // `guardFlags` với `exit` tiêm vào: khoá đúng hai mã thoát, và khoá rằng cờ lạ KHÔNG rơi vào
  // nhánh `--help` (exit 0 ở đó là bug nguỵ trang thành tính năng).
  const codes = [];
  const sink = () => {};
  guardFlags(['--dyas'], SPEC, { exit: (c) => codes.push(['lạ', c]), out: sink, err: sink });
  guardFlags(['--help'], SPEC, { exit: (c) => codes.push(['help', c]), out: sink, err: sink });
  guardFlags(['--all'], SPEC, { exit: (c) => codes.push(['đúng', c]), out: sink, err: sink });
  // …và THỨ TỰ ƯU TIÊN là chính sách, nên nó được khoá ở ĐÂY: `--help` đi kèm một cờ gõ nhầm
  // phải exit 1. Thoát 0 ở đó là bug nguỵ trang thành tính năng — người gõ nhầm đọc được một
  // bảng cách dùng và một mã thoát "ổn".
  guardFlags(['--help', '--dyas'], SPEC, { exit: (c) => codes.push(['help+lạ', c]), out: sink, err: sink });
  const wantCodes = JSON.stringify([['lạ', 1], ['help', 0], ['help+lạ', 1]]);
  if (JSON.stringify(codes) !== wantCodes) fail.push(`guardFlags             mã thoát sai: ${JSON.stringify(codes)}, cần ${wantCodes} (cờ đúng KHÔNG được thoát)`);
  else ok.push(`guardFlags             cờ lạ ⇒ exit 1 · \`--help\` ⇒ exit 0 · cờ đúng ⇒ KHÔNG thoát, chạy tiếp`);

  // ── TẦNG HAI: spawn THẬT. Đây là tầng khoá "đã cắm", và nó là lý do khối này tồn tại.
  //
  // Mỗi CLI được gọi hai lần: một cờ gõ nhầm (phải exit 1, phải nói ở stderr) và đường thường
  // (phải KHÔNG bị bản vá chặn quá tay). Ca thứ hai bắt đúng chiều mà `L0002` cảnh báo.
  // ── TẦNG HAI-A: TĨNH — MỌI CLI đọc argv phải GỌI `guardFlags` ──────────────
  //
  // Con số đầu tiên của tôi SAI: quét `tooling/*.mjs` rồi báo "8 CLI". Quét lại toàn repo ra
  // **16** — cái bị bỏ sót nặng nhất là `evals/run.mjs`: ngoài `tooling/`, có GHI state, và CI
  // chạy nó. Vá nửa lớp thì lần sau có người rơi vào nửa kia.
  //
  // Phép kiểm này TĨNH có chủ ý. Bản đầu của tôi spawn cả 16 CLI × 2 chiều, và suite đi từ ~25s
  // lên **quá 500s** — tức bản vá chống-harness-cản-việc tự biến thành harness cản việc, đúng
  // thứ `AGENTS.md` §Verification đặt ngân sách để chặn. Câu hỏi *"file này có gọi guardFlags
  // không"* là câu hỏi TĨNH; trả nó bằng 30 lần spawn là chọn sai tầng.
  const argvUsers = [];
  const missing = [];
  const SKIP = new Map([
    ['tooling/lib/harness.mjs', 'chính nơi ĐỊNH NGHĨA guardFlags'],
    ['tooling/test-hooks.mjs', 'suite này không đọc argv của chính nó — hai lần khớp là chuỗi đi SCAN mã nguồn'],
    ['tooling/fixtures/make-fixture-2.14.0.mjs', 'sinh fixture một lần, không phải CLI người gõ'],
    ['evals/fixtures/fake-agent.mjs', 'giả lập AGENT: argv của nó là hợp đồng với runner, không phải cờ người gõ'],
    ['tooling/fixlog.mjs', 'argv của nó là NỘI DUNG tự do (#198): `fixlog ghi chú về --force` phải đi lọt, nên luật ở đó chỉ hỏi args[0]'],
    ['tooling/doctor.mjs', 'alias 2.x chuyển tiếp NGUYÊN argv sang harness-doctor.mjs — nơi ĐÓ đã có guard; thêm ở đây là hai spec phải giữ đồng bộ, và cái thứ hai sẽ lệch'],
  ]);
  for (const rel of ['evals/run.mjs', 'evals/fixtures/fake-agent.mjs', 'tooling/lib/harness.mjs',
    'tooling/fixtures/make-fixture-2.14.0.mjs', 'tooling/test-hooks.mjs',
    ...readdirSync(repoPath('tooling')).filter(f => f.endsWith('.mjs')).map(f => `tooling/${f}`),
    ...readdirSync(repoPath('tooling', 'knowledge')).filter(f => f.endsWith('.mjs')).map(f => `tooling/knowledge/${f}`)]) {
    const abs = repoPath(...rel.split('/'));
    if (!exists(abs)) continue;
    const src = readFileSync(abs, 'utf8');
    if (!/process\.argv/.test(src)) continue;
    if (argvUsers.includes(rel)) continue;
    argvUsers.push(rel);
    if (SKIP.has(rel) || /guardFlags\(/.test(src)) continue;
    missing.push(rel);
  }
  const USERS_FLOOR = 24;
  if (missing.length) {
    fail.push(`cờ lạ · tĩnh${' '.repeat(9)} ${missing.length} CLI đọc argv mà KHÔNG gọi \`guardFlags\` — cờ gõ nhầm ở đó rơi thẳng `
      + `vào nhánh mặc định, im lặng: ${missing.join(' · ')}`);
  } else if (argvUsers.length < USERS_FLOOR) {
    fail.push(`cờ lạ · tĩnh${' '.repeat(9)} chỉ thấy ${argvUsers.length} CLI đọc argv (sàn ${USERS_FLOOR}) — phép quét đã trôi, `
      + 'và danh sách rỗng làm case này xanh mà không kiểm gì cả');
  } else {
    ok.push(`cờ lạ · tĩnh${' '.repeat(9)} ${argvUsers.length} CLI đọc argv, tất cả gọi \`guardFlags\` (${SKIP.size} miễn CÓ KHAI LÝ DO, sàn ${USERS_FLOOR})`);
  }

  // ── TẦNG HAI-B: HÀNH VI — mẫu nhỏ, spawn THẬT ─────────────────────────────
  //
  // Tầng tĩnh bắt "chưa cắm"; nó KHÔNG bắt được "cắm rồi nhưng spec sai" hay "guard đặt SAU
  // lần ghi đầu tiên". Bốn CLI đại diện, mỗi cái vì một lý do khác nhau — không phải mẫu ngẫu
  // nhiên:
  //
  //   capo-report  — CLI có thiệt hại ĐO ĐƯỢC (ghi sổ nghi thức đọc)
  //   rituals      — guard nằm TRONG khối main (module này bị import ở nơi khác)
  //   setup        — cái duy nhất ghi `harness.config.json`
  //   evals/run    — ngoài `tooling/`, và là cái tôi bỏ sót ở lần đếm đầu
  const CLIS = [
    //  file                   cờ gõ nhầm             đường thường
    ['capo-report.mjs',       ['--dyas', '30'],      ['--days', '30']],
    ['rituals.mjs',           ['--alll'],            ['--all']],
    ['setup.mjs',             ['--aply'],            ['--detect']],
    ['../evals/run.mjs',      ['--dryy'],            ['--dry']],
  ];
  const badCli = [];
  let ranHappy = 0;
  for (const [file, typo, happy] of CLIS) {
    const t = run(process.execPath, [repoPath('tooling', file), ...typo], { shell: false });
    if (t.status !== 1) badCli.push(`${file} ${typo.join(' ')} → exit ${t.status} ≠ 1`);
    else if (!/cờ không nhận ra/.test(t.stderr || '')) badCli.push(`${file}: chặn mà KHÔNG nói ở stderr`);
    // `null` = đường thường tốn quá lâu hoặc cần mạng (`coactivity` gọi `gh`); bỏ qua CÓ KHAI,
    // không lặng lẽ — xem `ranHappy` in ra ở dòng ok.
    if (happy) {
      const h = run(process.execPath, [repoPath('tooling', file), ...happy], { shell: false });
      if (h.status !== 0) badCli.push(`${file} ${happy.join(' ')} → exit ${h.status} ≠ 0 — bản vá chặn quá tay`);
      else ranHappy += 1;
    }
  }
  if (badCli.length) fail.push(`cờ lạ · hành vi${' '.repeat(7)} ${badCli.length} ca sai: ${badCli.join(' | ')}`);
  else ok.push(`cờ lạ · hành vi${' '.repeat(7)} ${CLIS.length} CLI đại diện chặn cờ lạ (exit 1 + nói ở stderr) · ${ranHappy} đường thường vẫn exit 0 — tầng này bắt thứ tầng tĩnh không bắt: spec sai, hoặc guard đặt SAU lần ghi đầu`);
}

// Sàn của riêng suite này. Con số ban đầu = tổng ĐO ĐƯỢC lúc tách (v2.80.0), không phải số
// ước lượng: sàn đặt thấp hơn tổng thật là sàn đã nghỉ việc (xem chú thích cùng chỗ ở
// `test-hooks.mjs`).
const RATCHET = 61;   // = tổng ĐO ĐƯỢC lúc tách (v2.80.0). 230 (test-hooks) + 61 = 291 = tổng TRƯỚC khi tách — không mất khẳng định nào.
const ran = ok.length + fail.length;
const naCount = naEntries.reduce((s, e) => s + e.count, 0);
const total = ran + naCount;
if (total < RATCHET) {
  fail.push(`chỉ có ${total} khẳng định (${ran} chạy + ${naCount} không dựng được), sàn là ${RATCHET} — `
    + 'một case đã NGỪNG CHẠY. Đây là chế độ hỏng mà một suite "xanh 100%" che kín nhất.');
}
console.log(`\n=== LIB TESTS (${ok.length}/${ran} pass`
  + `${naCount ? ` · ${naCount} n/a (không dựng được ở hình dạng checkout này)` : ''}, sàn ${RATCHET}) ===`);
for (const m of ok) console.log('  PASS  ' + m);
for (const e of naEntries) console.log('  n/a   ' + e.msg);
for (const m of fail) console.log('  FAIL  ' + m);
console.log('');
emitVerdict('LIB TESTS', { fail: fail.length, code: fail.length ? 1 : 0 });
process.exit(fail.length ? 1 : 0);
