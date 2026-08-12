#!/usr/bin/env node
/**
 * MỘT lệnh kiểm sức khoẻ toàn bộ harness.
 *
 *   node tooling/harness-doctor.mjs            chạy mọi kiểm tra
 *   node tooling/harness-doctor.mjs --quick    bỏ qua phần chậm  ← Setup:maintenance hook
 *
 * Đây là điểm vào duy nhất bạn cần nhớ. Nó gọi mọi công cụ khác và tổng hợp
 * thành một bảng có hành động — thay vì bắt bạn nhớ 8 lệnh.
 *
 * TÊN CÓ TIỀN TỐ `harness-` LÀ CỐ Ý: `/doctor` là lệnh NATIVE của Claude Code, và
 * nó làm việc khác (chẩn đoán cài đặt, đề xuất cắt gọn CLAUDE.md). Hai thứ cùng tên
 * trong một template phân phối cho nhiều đội là chi phí nhầm lẫn tăng theo số repo.
 * `tooling/doctor.mjs` còn tồn tại như alias ở 2.x và bị xoá ở 3.0.0.
 *
 * Chạy: sau khi áp template · sau khi nâng cấp · mỗi 2 tuần · khi thấy "agent hôm nay lạ".
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoPath, run, config, readJson, git, exists, missingLines, REQUIRED_ATTRIBUTES, repoRole, currentBranch, matchAny, pathsFor, governanceDrift, prohibitionText, isRecordedRemoval, declaredCommands, tallyLines, devId, TEST_TELEMETRY_DIR, TEST_RUN_ID, sweepStaleTestRuns, coordinationLayer, verificationCoverage, readPacks, packPending, budgetSnapshot, configCoverage, stuckRituals, readRitualStates, releaseTagGap, emitVerdict, frictionReading, slotCounters } from './lib/harness.mjs';

const QUICK = process.argv.includes('--quick');
// PHẢI chụp TRƯỚC khi chạy các suite bên dưới: nó là mốc phân biệt "telemetry suite của lần
// chạy NÀY" với "telemetry còn sót từ lần trước". Xem mục BẰNG CHỨNG THỨ HAI ở danh mục hook.
const RUN_STARTED = Date.now();
const cfg = config();

const checks = [
  { id: 'hooks',    label: 'Hook tests',              cmd: ['tooling/test-hooks.mjs'],        critical: true },
  // Migration là code DUY NHẤT ghi vào repo người khác ⇒ critical, ngang hàng hook tests.
  { id: 'migs',     label: 'Migration tests',         cmd: ['tooling/test-migrations.mjs'],   critical: true },
  // Runner eval là lớp INFERENTIAL duy nhất trong repo, và nó chỉ chạy khi có người điền
  // `evals.command` — chưa repo nào từng điền. Suite này kiểm nó bằng agent GIẢ: tất định,
  // miễn phí, và nó đã bắt được 3 bug thật ở 2.7.8.
  { id: 'evals',    label: 'Eval runner tests',       cmd: ['tooling/test-evals.mjs'],        critical: false },
  { id: 'coverage', label: 'Template coverage',       cmd: ['tooling/apply-to.mjs', '--audit'], critical: false },
  { id: 'know',     label: 'Knowledge lint',          cmd: ['tooling/knowledge/lint.mjs'],    critical: false },
  { id: 'consumers',label: 'Sổ consumer',             cmd: ['tooling/knowledge/consumers.mjs'], critical: false },
  { id: 'entropy',  label: 'Entropy scan',            cmd: ['tooling/entropy-scan.mjs'],      critical: false },
  { id: 'size',     label: 'Kích thước harness',      cmd: ['tooling/harness-size.mjs'],      critical: false },
  { id: 'feature',  label: 'Feature integrity',       cmd: ['tooling/check-feature-integrity.mjs'], critical: false, slow: true },
  { id: 'evals',    label: 'Eval (liệt kê)',          cmd: ['evals/run.mjs', '--dry'],        critical: false },
];

const results = [];
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  HARNESS DOCTOR                                              ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// GHIM lần chạy xuống con. Suite ghi telemetry vào thư mục theo `HARNESS_TEST_RUN_ID`; không
// truyền xuống thì con dùng pid CỦA NÓ, và doctor đọc một thư mục rỗng rồi kết luận "chưa có
// bằng chứng" về đúng những cái gác vừa chạy xong trong chính lần chạy này. Đây là cùng một
// mệnh đề với hằng số dùng chung ở `lib` — chỉ khác, giờ chỗ thoả thuận là env chứ không phải
// một cái tên cố định toàn máy (xem #100).
sweepStaleTestRuns();
for (const c of checks) {
  if (QUICK && c.slow) { results.push({ ...c, status: 'skip' }); continue; }
  if (!exists(repoPath(c.cmd[0]))) { results.push({ ...c, status: 'missing' }); continue; }
  const r = run('node', [repoPath(c.cmd[0]), ...c.cmd.slice(1)], { env: { HARNESS_TEST_RUN_ID: TEST_RUN_ID } });
  results.push({ ...c, status: r.status === 0 ? 'pass' : 'fail', out: (r.stdout + '\n' + r.stderr).trim() });
}

const ICON = { pass: '  ✓', fail: '  ✗', skip: '  –', missing: '  ?' };
for (const r of results) {
  console.log(`${ICON[r.status]}  ${r.label.padEnd(26)} ${r.status === 'pass' ? '' : r.status.toUpperCase()}`);
}

// ── Cấu hình đã sẵn sàng chưa ────────────────────────────────────────────────
console.log('\n── CẤU HÌNH ──');
const blockers = [], advice = [];

// Repo TEMPLATE thì CHANGEME và commands rỗng là ĐÚNG — đó là placeholder.
// Project THẬT thì cùng trạng thái đó nghĩa là gate không tồn tại.
const ROLE = repoRole();
const IS_TEMPLATE = ROLE === 'template';
const blocker = m => (IS_TEMPLATE ? advice : blockers).push(m);

/**
 * PLACEHOLDER: ở project thật là CHẶN, ở template là ĐÚNG — nên ở template nó không được
 * xuống "Nên làm", nó phải BIẾN MẤT.
 *
 * `blocker()` hạ mọi thứ xuống `advice` ở template. Với placeholder thì hạ cấp vẫn sai: doctor
 * in "placeholder CHANGEME là đúng, không phải lỗi" ở đầu, rồi liệt kê ĐÚNG BA dòng CHANGEME
 * đó dưới "Nên làm (19)" — cùng một công cụ, hai câu trả lời ngược nhau, cách nhau 30 dòng.
 * Một danh sách việc chứa việc KHÔNG ĐƯỢC PHÉP LÀM sẽ dạy người đọc bỏ qua cả danh sách, và
 * đó là danh sách duy nhất ở đây có quyền đòi hành động.
 */
const placeholder = (m, okMsg) => {
  if (IS_TEMPLATE) console.log(`  ✓  ${okMsg}`);
  else blockers.push(m);
};

if (IS_TEMPLATE) console.log('  ℹ  Đây là REPO TEMPLATE — placeholder CHANGEME là đúng, không phải lỗi.');
// Trạng thái thứ BA phải được NÓI RA, không được âm thầm gộp vào một trong hai kia. Không có
// manifest và cũng không có changelog nghĩa là harness tới đây bằng đường không ai theo dõi
// được — và `upgrade` sau này sẽ ghi đè MÙ vì nó không có hash nào để so.
if (ROLE === 'unknown') {
  blockers.push('không xác định được VAI của repo này: không có `.claude/harness-manifest.json` (dấu của repo đã áp) '
    + 'và cũng không có `tooling/cli.mjs` (dấu của repo template — thứ DUY NHẤT không bao giờ ship xuống repo con). Harness tới đây bằng đường không ai theo dõi được — '
    + 'nâng cấp sau này sẽ ghi đè MÙ vì không có hash nào để so. Sửa: `node <template>/tooling/apply-to.mjs . --apply --update` một lần để tạo manifest.');
}

if (String(cfg.project?.id).includes('CHANGEME')) placeholder('harness.config.json → project.id vẫn là CHANGEME', 'project.id = CHANGEME (placeholder của template)');
if (String(cfg.project?.dri || '').includes('CHANGEME')) placeholder('harness.config.json → project.dri chưa điền', 'project.dri chưa điền (placeholder của template)');

// DEV_ID không nằm trong `harness.config.json` (nó khác nhau theo MÁY, không theo project) nên
// nó không đi qua `placeholder()` như hai dòng trên. Nhưng nó im lặng theo cùng một kiểu và
// đắt hơn: nó là cột "AI" của sổ audit cửa thoát DRI, và placeholder được ghi vào đó như thể
// là một cái tên (#114). Đo 2026-08-08: cả 3 dòng ghi vùng cấm hôm đó đều mang một "người".
const who = devId();
if (!who.id) {
  advice.push('DEV_ID chưa khai và không có USER/USERNAME — sổ audit cửa thoát DRI (`harness-edits.log`) '
    + 'đang khuyết danh, tức nó không trả lời được câu hỏi duy nhất nó sinh ra để trả lời. '
    + 'Sửa: `.claude/settings.local.json` → `env.DEV_ID`');
} else if (who.from !== 'DEV_ID') {
  advice.push(`DEV_ID chưa khai — đang tạm dùng ${who.from}=${who.id}. Cùng một người trên hai máy `
    + `thường có ${who.from} khác nhau, nên reservation và telemetry sẽ đọc bạn thành hai người. `
    + 'Sửa: `.claude/settings.local.json` → `env.DEV_ID`');
} else {
  console.log(`  ✓  DEV_ID = ${who.id} — sổ audit và reservation biết dòng nào là của bạn`);
}

const cmds = declaredCommands(cfg);
if (!cmds.length) {
  placeholder('commands rỗng — GATE KHÔNG TỒN TẠI. Harness này đang chỉ là trang trí, và BẠN là verification loop.',
    'commands rỗng — placeholder của template. Ở project đích, ĐÂY LÀ DÒNG CHẶN.');
} else {
  console.log(`  ✓  ${cmds.length} lệnh đã khai: ${cmds.map(([k]) => k).join(', ')}`);
  for (const need of ['verify', 'typecheck', 'test']) {
    if (!cfg.commands?.[need]) advice.push(`chưa khai commands.${need} — gate sẽ bỏ qua nó`);
  }
}

// CHỈ đọc DÒNG LUẬT, không đọc cả file. Quét cả file thì một comment GIẢI THÍCH về
// placeholder cũng bị tính là dùng placeholder — cùng lớp lỗi với `fmKeys()` bên dưới:
// văn xuôi NHẮC tới một thứ không phải là KHAI nó. Check tự bắn nhầm là check bị tắt.
const coText = exists(repoPath('.github', 'CODEOWNERS')) ? readFileSync(repoPath('.github', 'CODEOWNERS'), 'utf8') : '';
const PLACEHOLDER = /^@(dri|tech-lead|[a-z]+-team|owner|team)$/i;
const coOwners = new Set(
  coText.split(/\r?\n/)
    .map(l => l.replace(/#.*$/, '').trim())          // bỏ comment, kể cả comment cuối dòng
    .filter(Boolean)
    .flatMap(l => l.split(/\s+/).slice(1)),          // cột 1 là path, còn lại là owner
);
const coPlaceholders = [...coOwners].filter(o => PLACEHOLDER.test(o));
if (coPlaceholders.length) {
  blocker(`.github/CODEOWNERS còn handle placeholder (${coPlaceholders.join(' ')}) — HAI điều kiện, không phải một: `
    + 'handle phải TỒN TẠI **và** có quyền PUSH. Thiếu cái nào GitHub cũng BỎ QUA IM LẶNG, '
    + 'PR hiện "không yêu cầu review nào" và bạn tưởng mình được bảo vệ. '
    + 'Kiểm: `gh api users/<handle> --jq .login` và `gh api repos/<owner>/<repo>/collaborators --jq \'.[].login\'`');
}

if (!exists(repoPath('.mcp.json')) && exists(repoPath('.mcp.json.example'))) {
  advice.push('chưa có .mcp.json (có .example) — không sao nếu bạn chưa cần MCP');
}
const mcpCount = Object.keys(readJson(repoPath('.mcp.json'), {})?.mcpServers ?? {}).length;
const mcpMax = cfg.mcp?.maxServers ?? 5;
if (mcpCount > mcpMax) advice.push(`${mcpCount} MCP server (ngưỡng ${mcpMax}) — tool definition ăn context mỗi request`);

// ── Field khai mà không ai đọc · code đọc mà không ai khai ───────────────────
//
// Cùng một lớp lỗi đã bị sửa BẰNG TAY ba lần — `budget.modelTiering` (2.0.0),
// `budget.monthlyUsdCap` (2.28.0), `budget.maxToolCallsPerRun` (2.35.0) — mỗi lần một
// bia mộ đẹp trong config, và không lần nào dựng máy dò. Ba field khác sống sót vì
// không ai đi tìm. `AGENTS.md`: lỗi cùng kiểu ≥2 lần thì làm CƠ CHẾ, đừng sửa tay lần nữa.
//
// Một field không ai đọc là **một niềm tin được đóng gói thành cấu hình**: nó đọc như một
// núm vặn, người ta vặn, và không có gì xảy ra. Chiều ngược lại tệ hơn theo cách khác —
// một hằng số cứng mà người đọc config để hiệu chỉnh KHÔNG THẤY NÓ TỒN TẠI.
const cov = configCoverage();
if (cov.unread.length) {
  advice.push(`${cov.unread.length} field trong harness.config.json KHÔNG ai đọc: ${cov.unread.join(' · ')}`
    + ` — hoặc cho nó một người đọc, hoặc CẮT nó và giữ nguyên lý trong docs/. Một núm vặn không nối vào gì`
    + ` dạy người dùng rằng config này không đáng tin.`);
}
for (const k of cov.undeclared) {
  advice.push(`code đọc \`${k}\` nhưng harness.config.json KHÔNG khai — giá trị mặc định trở thành hằng số cứng,`
    + ` và người mở config để hiệu chỉnh không thấy nó tồn tại. Khai nó (kèm \`$comment_\` nếu vắng mặt là CỐ Ý).`);
}
console.log(`  ${cov.unread.length || cov.undeclared.length ? '⚠️ ' : '✓'}  config: ${cov.leaves} field`
  + ` · ${cov.unread.length} không ai đọc · ${cov.undeclared.length} đọc-mà-chưa-khai`
  + (cov.excused.length ? ` · ${cov.excused.length} cố ý vắng (có $comment_)` : ''));

// ── NGÂN SÁCH ────────────────────────────────────────────────────────────────
// Chỉ THU THẬP + IN ở đây; phán đoán ở `budgetStatus` trong lib (hàm THUẦN, cùng lý do tách
// như `coordinationLayer`). Trước v2.28.0 chỗ này là nơi DUY NHẤT đọc `monthlyUsdCap`, và
// chỉ để nói "= 0" — nghĩa là đặt số vào cũng không có gì xảy ra.
{
  // `role` (#92): bốn chỗ khác trong file này đã biết vai; chỗ này là chỗ thứ năm và nó
  // KHÔNG biết, nên nó đòi khai trần ở đúng nơi `setup.mjs:55` từ chối ghi.
  // Gói PHẲNG (#111): cổ chai không phải USD mà là RATE LIMIT, và con số đó đã nằm sẵn trong
  // `budget-alarm.log` (observe.mjs ghi ở mỗi StopFailure). Đọc nó ở ĐÂY chứ không trong
  // `budgetStatus` — hàm đó là HÀM THUẦN, và một lần đọc đĩa lén trong đó làm test mất khả
  // năng lái từng ca. `null` khi không đọc được ⇒ `?`, không phải 0.
  // MỘT phép IO cho CẢ HAI bên đọc — xem `budgetSnapshot()`. Bản trước lắp tham số tại chỗ,
  // và bên đọc kia (`rituals.mjs`) quên đúng một tham số ⇒ hai công cụ đọc cùng một cái sổ và
  // trả lời trái ngược nhau (#125).
  const b = budgetSnapshot(cfg, ROLE, RUN_STARTED);
  console.log('\n── NGÂN SÁCH ──');
  const cap = Number(cfg.budget?.monthlyUsdCap) || 0;
  const LINE = {
    off: '  ?    chưa khai trần chi tiêu (budget.monthlyUsdCap = 0) — KHÔNG phải "ổn"',
    unmeasured: `  ?    trần $${cap}/tháng đã khai, CHƯA lần nào đo chi tiêu — cap chưa so với gì cả`,
    stale: `  ?    trần $${cap}/tháng · số đo gần nhất ${b.ageDays} ngày trước — quá cũ để nói về tháng này`,
    ok: `  ok   run-rate $${b.runRate?.toFixed(0)}/tháng = ${b.percent}% trần $${cap} (số NHẬP TAY ${b.ageDays} ngày trước)`,
    alert: `  ⚠️   run-rate $${b.runRate?.toFixed(0)}/tháng = ${b.percent}% trần $${cap} (số NHẬP TAY ${b.ageDays} ngày trước)`,
    over: `  ⚠️   run-rate $${b.runRate?.toFixed(0)}/tháng VƯỢT trần $${cap} (${b.percent}%, số NHẬP TAY ${b.ageDays} ngày trước)`,
    'template-na': `  n/a  trần tháng KHÔNG khai được ở repo template (setup.mjs từ chối — cap ở đây chảy xuống mọi consumer)`
      + `. CAPO thì đo được: ${b.measured ? `đã đo ${b.ageDays ?? '?'} ngày trước` : 'CHƯA lần nào'}`,
    'template-cap': `  ⚠️   trần $${cap} nằm trong REPO TEMPLATE — nó sẽ chảy xuống MỌI consumer áp template sau này`,
    'flat-unmeasured': '  ?    gói PHẲNG — không đọc được `budget-alarm.log`, nên số lần chạm rate limit KHÔNG ĐO ĐƯỢC',
    'flat-limited': `  ⚠️   gói PHẲNG · ${b.rateLimitHits} lần chạm rate limit trong 30 ngày — ĐÂY là trần thật, không phải USD`,
    // ⚠️ → ok là CÓ CHỦ Ý, và lý do không phải "ít nghiêm trọng hơn": cùng ${b.rateLimitHits}
    // lần chạm, nhưng ở đây chúng đã ĐỔI được ra một con số. Dấu ⚠️ ở dòng trên nói "bạn có
    // một cổ chai chưa ai soi"; khi đã soi rồi thì thứ đáng in là TỈ LỆ, không phải dấu.
    'flat-capo': `  ok   gói PHẲNG · CAPO-TRẦN = ${b.flatCapo} lần chạm trần / kết quả `
      + `(${b.rateLimitHits} lần trong 30 ngày · tỉ lệ đo trên cửa sổ ${b.flatDays} ngày, ${b.flatAgeDays} ngày trước)`,
    'flat-ok': '  ok   gói PHẲNG · 0 lần chạm rate limit trong 30 ngày — cổ chai hiện không phải hạn mức',
  };
  console.log(LINE[b.mode]);
  // Dòng "harness không đọc được hoá đơn" chỉ đúng khi con số ĐANG hiển thị là USD nhập tay.
  // Ở gói phẳng thì con số là số lần chạm rate limit, do chính harness đo — in câu đó ở đây
  // là nói sai về nguồn gốc dữ liệu của chính mình.
  if (!['off', 'template-na', 'flat-ok', 'flat-limited', 'flat-unmeasured', 'flat-capo'].includes(b.mode)) {
    console.log('       harness KHÔNG đọc được hoá đơn — con số này do người chép từ dashboard billing.');
  }
  if (b.advice) advice.push(b.advice);
}

// Ngưỡng kích cỡ PR của REPO TEMPLATE cao hơn của repo sản phẩm, và có lý do (xem
// $comment_prLines trong harness.config.json). Nhưng `harness.config.json` là SEED —
// project mới THỪA HƯỞNG con số đó, và thừa hưởng nó im lặng là cách một ngoại lệ có
// lý do biến thành mặc định không ai nhớ tại sao. Máy nhắc, đừng trông vào việc ai đó đọc.
if (!IS_TEMPLATE && (cfg.limits?.prFailLines ?? 0) >= 1500) {
  advice.push(`limits.prFailLines = ${cfg.limits.prFailLines} — đây là ngưỡng của REPO TEMPLATE `
    + '(nơi mọi thay đổi harness là đa file: hook + config + test + changelog + migration). '
    + 'Repo sản phẩm nên hạ về 400/800: PR nhỏ là cách co cửa sổ conflict, không phải hình thức.');
}

// ── Git / phối hợp ───────────────────────────────────────────────────────────
console.log('\n── GIT & PHỐI HỢP ──');
const hooksPath = run('git', ['config', 'core.hooksPath']).stdout;
if (hooksPath !== '.githooks') blocker('core.hooksPath chưa trỏ .githooks — pre-commit guard KHÔNG chạy. Sửa: node tooling/init.mjs');
else console.log('  ✓  pre-commit guard đang bật');

for (const [k, want] of [['core.autocrlf', 'false'], ['core.ignorecase', 'false']]) {
  const got = run('git', ['config', k]).stdout;
  if (got !== want) advice.push(`git config ${k} = "${got || 'chưa set'}" (nên là ${want}) — chạy node tooling/init.mjs`);
}

const wt = (git(['worktree', 'list', '--porcelain']).stdout.match(/^worktree /gm) || []).length;
const maxWt = cfg.limits?.maxWorktrees ?? 4;
if (wt - 1 > maxWt) advice.push(`${wt - 1} worktree (trần ${maxWt}) — chạy node tooling/wt-clean.mjs`);

// ── Đường biên commit / không-commit có ĐÚNG không ───────────────────────────
// Trước 2.5.0 `.gitignore` nằm trong `SEED` của apply-to, và SEED không ghi đè file đã
// tồn tại ⇒ ở project THẬT (nơi nào cũng đã có .gitignore) các dòng của harness không
// bao giờ tới. Không check nào phát hiện, nên nó im lặng đúng nghĩa: bạn chỉ biết khi
// thấy `.claude/settings.local.json` của đồng nghiệp trong diff của mình.
//
// TRỌNG TÀI Ở ĐÂY LÀ `git check-ignore`, KHÔNG PHẢI SO CHUỖI. So chuỗi trả lời "file
// ignore có chứa dòng X" — câu hỏi thật là "git có ignore đường dẫn này". Hai câu khác
// nhau khi có `.claude/` ignore rộng ở trên, hoặc `!` phủ định ở dưới; và ca đó là ca
// khiến người ta mất cả buổi vì file rõ ràng "đã có trong .gitignore".
const ignored = (p) => run('git', ['check-ignore', '-q', p]).status === 0;
const MUST_NOT_TRACK = ['.claude/settings.local.json', '.claude/telemetry/x.log', '.claude/state/x.json', '.harness-pack/x'];
const MUST_TRACK = ['.claude/settings.json', '.claude/hooks/observe.mjs', 'harness.config.json'];
if (git(['rev-parse', '--git-dir']).status === 0) {
  const leaking = MUST_NOT_TRACK.filter(p => !ignored(p));
  const buried = MUST_TRACK.filter(p => exists(repoPath(p)) && ignored(p));
  if (leaking.length) blocker(`git KHÔNG ignore ${leaking.length} đường dẫn phải là cá nhân: ${leaking.join(' · ')}`
    + ` — dữ liệu cá nhân và log máy-cục-bộ sẽ vào lịch sử CHUNG. Sửa: chạy lại apply-to (nó thêm dòng thiếu), hoặc thêm tay.`);
  else console.log('  ✓  đường biên commit/không-commit đúng');
  if (buried.length) blocker(`git ĐANG ignore ${buried.join(' · ')} — đây là harness của TEAM, phải commit.`
    + ` Cả đội tưởng mình có harness, nhưng chỉ máy này có. Nguyên nhân gần như luôn là một dòng`
    + ` ignore rộng \`.claude/\` có từ trước khi áp harness. Sửa: thêm \`!.claude/\` — KHÔNG phải`
    + ` \`!.claude/settings.json\`: sau khi cả thư mục bị loại, phủ định cho từng FILE bên trong`
    + ` không có tác dụng (đo bằng git check-ignore). Hoặc chạy lại apply-to, nó tự thêm đúng dòng.`);
}
const attrTxt = exists(repoPath('.gitattributes')) ? readFileSync(repoPath('.gitattributes'), 'utf8') : '';
const attrMissing = missingLines(attrTxt, REQUIRED_ATTRIBUTES);
if (attrMissing.length) advice.push(`.gitattributes thiếu \`${attrMissing.join('`, `')}\` — đây là điều số 8 trong "mười hai điều": `
  + `năm dòng xoá một lớp conflict GIẢ cho mọi PR trong team đa OS. Sửa: chạy lại apply-to.`);

// ── Lớp phối hợp: bao nhiêu người, và cơ chế nào đang TẮT vì thế ─────────────
//
// `check-reservations.mjs` thoát 0 im lặng khi solo — đúng cho một hook pre-commit chạy ở
// mọi commit, nhưng nó làm cơ chế đó VÔ HÌNH. Một guard tắt mà không ai nhìn thấy thì lần
// sau người ta debug "vì sao đặt chỗ không có tác dụng" bằng cách đọc code. Đây là kênh
// thấy được, và nó là chỗ duy nhất hai ca `1` và `chưa khai` được kể tách nhau.
// ── Lớp xác minh có mẫu số không, hay đang chạy trên tập rỗng ────────────────
// Phán đoán ở `verificationCoverage` (lib, hàm THUẦN); đây chỉ THU THẬP + IN.
console.log('\n── LỚP XÁC MINH ──');
const { readdirSync: rd } = await import('node:fs');
const featureCount = (() => {
  const dir = repoPath('features');
  if (!exists(dir)) return 0;
  try {
    // `example-feature.json` là VÍ DỤ của template, nằm trong IGNORE của apply-to nên không
    // đi xuống consumer. Đếm nó là đếm một feature không ai viết ⇒ mẫu số giả.
    // `readdirSync` được khai bằng `const … = await import(…)` ở DƯỚI file này ⇒ ở đây nó
    // còn trong TDZ. Dùng `readdirSync` thẳng là ReferenceError lúc chạy, không phải lúc lint.
    return rd(dir).filter(f => f.endsWith('.json') && !f.startsWith('_') && f !== 'example-feature.json').length;
  } catch { return 0; }
})();
const commits7d = (() => {
  const r = git(['log', '--oneline', '--since=7 days ago']);
  return r.status === 0 ? r.stdout.split('\n').filter(Boolean).length : null;
})();
const vc = verificationCoverage({ role: repoRole(), features: featureCount, commits7d });
const VC_LINE = {
  'template-na': '  n/a  repo template không có feature thật theo thiết kế',
  unknown: '  ?    không đọc được lịch sử git — không đo được',
  quiet: `  ok   0 commit 7 ngày qua — chưa ship thì chưa nợ xác minh (${featureCount} feature)`,
  covered: `  ok   ${featureCount} feature được khai · ${commits7d} commit 7 ngày qua`,
  empty: `  ⚠️   ${commits7d} commit 7 ngày qua · 0 feature — lớp xác minh đang chạy trên TẬP RỖNG`,
};
console.log(VC_LINE[vc.mode]);
if (vc.advice) advice.push(vc.advice);

// Chỉ phần THU THẬP + IN ở đây; phán đoán nằm ở `coordinationLayer` trong lib (hàm THUẦN).
console.log('\n── LỚP PHỐI HỢP ──');
const ts = cfg.project?.teamSize;
const coord = coordinationLayer({ teamSize: ts, role: repoRole() });
if (coord.mode === 'solo') {
  console.log('  solo (project.teamSize = 1)');
  console.log('    TẮT: guard đặt chỗ ở pre-commit · dò reservation của người khác · "hỏi người" trong overlap-scan');
  console.log('    GIỮ: mọi guard an toàn, và dò chồng lấn giữa các NHÁNH của chính bạn');
} else if (coord.mode === 'team') {
  console.log(`  đội ${ts} người (project.teamSize) — toàn bộ lớp phối hợp đang bật`);
} else if (coord.mode === 'template-na') {
  console.log('  n/a  repo template không khai teamSize (nó là SEED) — consumer được hỏi lúc `setup.mjs`');
} else {
  console.log('  ?  project.teamSize CHƯA KHAI — đang giữ nguyên lớp phối hợp như có đội');
}
if (coord.advice) advice.push(coord.advice);

// ── Vòng học có đang chạy không ──────────────────────────────────────────────
console.log('\n── VÒNG HỌC ──');
const fixlogPath = repoPath('.claude', 'telemetry', 'manual-fixes.log');
const fixCount = exists(fixlogPath) ? readFileSync(fixlogPath, 'utf8').split('\n').filter(Boolean).length : 0;
const lessonCount = readJson(repoPath('knowledge', 'index.json'), { count: 0 }).count;
const evalCount = exists(repoPath('evals', 'tasks'))
  ? (await import('node:fs')).readdirSync(repoPath('evals', 'tasks')).filter(f => f.endsWith('.md') && !f.startsWith('_')).length : 0;

// "pack chờ quyết" đếm bằng ĐÚNG hàm mà `rituals.mjs` và `accept.mjs --list` dùng.
// Trước v2.27.0 mỗi nơi một định nghĩa: chỗ này đếm pack có THƯ MỤC `lessons/`, accept đếm
// FILE `.md` bên trong. Pack `lessons/` rỗng ⇒ chỗ này nói "1 pack chờ duyệt — quyết đi",
// accept nói "Không có gì", và người tin cái nói không-có-gì.
const packs = readPacks();
const decisions = (() => { try { return readFileSync(repoPath('knowledge', 'DECISIONS.log'), 'utf8'); } catch { return ''; } })();
const pend = packs === null ? null : packPending(packs, decisions);

console.log(`  fixlog: ${fixCount} mục  ·  bài học: ${lessonCount}  ·  eval task: ${evalCount}`
  + `  ·  pack chờ quyết: ${pend === null ? '?' : pend.count}`);
if (pend === null) advice.push('không đọc được knowledge/incoming/ — đây là `?`, không phải "không có pack nào"');
else if (pend.count) advice.push(`${pend.count} pack chờ quyết (${pend.material} mục nguyên liệu) ở knowledge/incoming/ — quyết đi: node tooling/knowledge/accept.mjs --list`);

// ── Ma sát ĐO ĐƯỢC: công cụ hỏng + chờ người (#132) ─────────────────────────
//
// Đứng cạnh `fixlog` vì nó là em họ TỰ ĐỘNG của fixlog: cùng câu hỏi ("hôm nay cái gì cản?"),
// khác chỗ là không ai phải nhớ gõ. Bên đọc phải tồn tại NGAY khi cắm ô — cắm mà không đọc là
// tự tạo mục tiếp theo cho danh sách cắt bỏ của `/harness-retro` bước 4.
{
  const readLog = (k) => { try { const f = join(repoPath('.claude', 'telemetry'), `${k}.log`); return exists(f) ? readFileSync(f, 'utf8') : ''; } catch { return null; } };
  const wiredEvents = (() => { try { return Object.keys(readJson(repoPath('.claude', 'settings.json'))?.hooks ?? {}); } catch { return []; } })();
  const fr = frictionReading({
    failures: readLog('tool-failures'),
    notifications: readLog('notifications'),
    wired: wiredEvents.includes('PostToolUseFailure') && wiredEvents.includes('Notification'),
  });
  const LINE = {
    'not-wired': '  n/a  ma sát chưa đo được: ô `PostToolUseFailure`/`Notification` chưa cắm (`node tooling/rituals.mjs --slots`)',
    unmeasured: '  ?    không đọc được `tool-failures.log` / `notifications.log` — đây là `?`, không phải 0',
    measured: `  ma sát ${fr.days} ngày: ${fr.errors} lần công cụ HỎNG · ${fr.interrupts} lần NGƯỜI dừng · `
      + `${fr.idle}/${fr.notifs} thông báo là "chờ người vượt ngưỡng"`
      + (fr.top?.length ? `\n       hay hỏng nhất: ${fr.top.map(t => `${t.tool} ${t.errors}`).join(' · ')}` : ''),
  };
  console.log(LINE[fr.mode]);
  // Con số `idle` KHÔNG so được giữa hai máy — ngưỡng `messageIdleNotifThresholdMs` là của
  // NGƯỜI DÙNG, và vendor không gửi thời lượng. Nói ra ở chỗ nó được in, không giấu trong lib.
  // Ba bộ đếm từ ba ô native khác (#135 · #136 · #137). Cùng chỗ in, vì chúng trả lời cùng một
  // câu hỏi ở ba tầng: cái gì đang cản, và cái gì đang KHÔNG được dùng.
  const sc = slotCounters({ skills: readLog('skill-calls'), agents: readLog('subagent-runs'), denied: readLog('permission-denied') });
  if (sc.skills) {
    console.log(`  skill được gọi ${sc.days} ngày: ${sc.skills.total} lần / ${sc.skills.distinct} skill khác nhau`
      + (sc.skills.top.length ? ` · hay dùng nhất: ${sc.skills.top.map(s => `${s.name} ${s.calls}`).join(' · ')}` : ''));
    // Đây là mẫu số mà `/entropy-sweep` chưa từng có. KHÔNG tự động cắt theo nó: một tuần dữ
    // liệu chưa nói được skill nào chết — đúng lý do `stuckRituals` có mode `warming`.
    if (sc.skills.total === 0) advice.push('chưa có lần gọi skill nào được ghi — ô `UserPromptExpansion` vừa cắm, cần vài phiên mới có mẫu. Đây là `?`, không phải "không skill nào được dùng"');
  }
  if (sc.agents) {
    console.log(`  subagent ${sc.days} ngày: ${sc.agents.starts} lần khởi động · ${sc.agents.types} loại · đỉnh ĐỒNG THỜI ${sc.agents.peak}`
      + (sc.agents.unpaired ? ` (${sc.agents.unpaired} chưa thấy mốc kết thúc ⇒ đỉnh có thể CAO HƠN sự thật)` : ''));
    // Con số 16 trong AGENTS.md là GIẢ ĐỊNH. Chỉ nói ra khi phép đo THẬT vượt nó.
    if (sc.agents.peak > 16) {
      advice.push(`đỉnh ${sc.agents.peak} subagent đồng thời — vượt con số 16 mà AGENTS.md dùng để đặt trần <5s ở SubagentStop. `
        + 'Trần đó nay là một giả định đã bị phép đo bác; đo lại bằng `node tooling/gates.mjs --list --timing`.');
    }
  }
  if (sc.denied) {
    console.log(`  bị TỪ CHỐI ${sc.days} ngày: ${sc.denied.vendor} lần do vendor · ${sc.denied.ours} lần do hook của ta`
      + (sc.denied.top.length ? ` · nhiều nhất: ${sc.denied.top.map(d => `${d.tool} ${d.vendor}`).join(' · ')}` : ''));
  }
  // #131: SỐ LIỆU ĐỂ QUYẾT ĐỊNH LÊN ĐẠN, không phải một cái gate. Gate ở `TaskCompleted` chặn
  // được thật (vendor: "prevent task completion"), nhưng payload không trỏ tới sản phẩm nào nên
  // nó phải TỰ đi tìm — và một guard đoán thì bắn nhầm được. Đây là canary ở dạng đo được.
  const tc = tallyLines(readLog('task-completed') ?? '', { field: 2, sinceMs: RUN_STARTED - 7 * 86400000 });
  const tcTotal = [...tc.values()].reduce((s, subs) => s + Object.values(subs).reduce((a, n) => a + (Number(n) || 0), 0), 0);
  if (tcTotal) {
    const wb = [...(tc.get('would-block') ? Object.values(tc.get('would-block')) : [])].reduce((a, n) => a + (Number(n) || 0), 0);
    console.log(`  task ĐÁNH DẤU XONG 7 ngày: ${tcTotal} lần · ${wb} lần gate SẼ chặn nếu được lên đạn (${Math.round(wb / tcTotal * 100)}%)`);
    advice.push(`gate \`TaskCompleted\` (#131) đang CHẠY KHÔNG ĐẠN: ${wb}/${tcTotal} lần nó sẽ chặn. `
      + 'Tỉ lệ đó CHÍNH LÀ tỉ lệ bắn nhầm nếu mọi lần chặn là oan, và là 0% oan nếu mọi lần đều đúng — '
      + 'đọc vài mục trong `.claude/telemetry/task-completed.log` rồi mới quyết. Lên đạn = một dòng trong observe.mjs.');
  }
  if (fr.mode === 'measured' && fr.idle > 0) {
    advice.push(`${fr.idle} lần agent chờ người vượt ngưỡng trong ${fr.days} ngày — đây là SỐ LẦN của MÁY NÀY `
      + '(ngưỡng `messageIdleNotifThresholdMs` do bạn chỉnh, và sự kiện không mang thời lượng), nên nó đọc được XU HƯỚNG chứ không so được với máy khác.');
  }
}

// ── Nghi thức nào ĐỎ mà không tắt được bằng hành động nó đề nghị (L0008) ─────
//
// VÌ SAO Ở DOCTOR, KHÔNG PHẢI Ở `rituals`: một nghi thức canh các nghi thức khác rơi vào đúng
// cái bẫy nó canh — nó đỏ khi có mục đỏ lâu, mà mục đỏ lâu thường là mục KHÔNG TẮT ĐƯỢC, nên nó
// cũng không tắt được. Doctor chạy THEO YÊU CẦU, không in ở mỗi phiên, nên nó không có bề mặt
// gây nhiễu. Cùng lý do W32 §3 bắt canary trước khi cắm hook.
//
// CÂU CHỮ LÀ SỐ ĐO, KHÔNG PHẢI SUY DIỄN. *"14 ngày liên tục đỏ, 0 lần xanh"* kiểm được;
// *"nghi thức này hỏng"* thì không, và nó sai với người vừa nghỉ phép hai tuần (`L0002`).
{
  const sr = stuckRituals(readRitualStates());
  const names = (rs) => rs.map(r => `${r.id} (${r.dueDays}ng)`).join(' · ');
  const LINE = {
    unmeasured: '  ?    chưa có sổ trạng thái nghi thức — nó tự ghi mỗi lần `rituals` chạy (SessionStart)',
    warming: `  ?    sổ nghi thức mới quan sát được ${sr.spanDays}/${sr.days} ngày — chưa đủ cửa sổ để nói mục nào KHÔNG tắt được`,
    stale: `  ?    sổ nghi thức ngừng cập nhật ${sr.staleDays} ngày trước — số này nói về quá khứ, không về hôm nay`,
    stuck: `  ⚠️   ${sr.stuck?.length} nghi thức \`due\` liên tục ≥${sr.days} ngày với 0 lần \`ok\`: ${names(sr.stuck ?? [])}`,
    pending: `  ok   ${sr.tracked} nghi thức · ${sr.pending?.length} mục đỏ lâu nhưng ĐÃ TỪNG xanh (${names(sr.pending ?? [])}) — việc tồn, không phải tín hiệu hỏng`,
    ok: `  ok   ${sr.tracked} nghi thức theo dõi ${sr.spanDays} ngày — không mục nào đỏ liên tục ≥${sr.days} ngày`,
  };
  console.log(LINE[sr.mode]);
  if (sr.mode === 'stuck') {
    advice.push(`${sr.stuck.length} nghi thức đỏ ≥${sr.days} ngày mà CHƯA LẦN NÀO xanh: ${names(sr.stuck)}. `
      + 'Hỏi đúng một câu: hành động ghi ở `cmd` có đổi được đại lượng đang lái mục đó không? '
      + 'Nếu không thì đây không phải việc của bạn — đó là bug của nghi thức (knowledge/lessons/0008).');
  }
}

if (fixCount === 0) advice.push('fixlog trống — vòng học chưa có nguyên liệu. Đây là việc RẺ NHẤT và GIÁ TRỊ NHẤT: `node tooling/fixlog.mjs "..."` mỗi lần bạn phải sửa tay (3 giây)');
if (evalCount === 0) advice.push('không có eval task — bạn đang TỐI ƯU MÙ: không có cách nào biết một thay đổi harness làm tốt lên hay tệ đi');
if (fixCount >= 10 && lessonCount === 0) advice.push(`${fixCount} lần sửa tay nhưng 0 bài học — chạy /harness-retro`);

// ── Manifest / version ───────────────────────────────────────────────────────
const mf = readJson(repoPath('.claude', 'harness-manifest.json'));
const localVer = exists(repoPath('harness.version')) ? readFileSync(repoPath('harness.version'), 'utf8').trim() : null;
if (mf) console.log(`  harness version: ${mf.templateVersion} (áp ${String(mf.upgradedAt || mf.appliedAt).slice(0, 10)})`);
else if (localVer) console.log(`  harness version: ${localVer} (chưa có manifest — nâng cấp lần tới sẽ không phát hiện được file bạn đã sửa)`);
else advice.push('không có .claude/harness-manifest.json — chạy upgrade.mjs một lần để tạo, nếu không nâng cấp sau này sẽ ghi đè mù');

// Đã áp template (có manifest) nhưng CHƯA phỏng vấn lần nào.
//
// `!mf.profile` là dấu của một QUY TRÌNH chưa chạy, KHÔNG phải của một KẾT QUẢ còn thiếu.
// Bản trước chặn chỉ dựa vào nó, và đo 2026-08-05 nó chặn CẢ BA repo tiêu thụ — cả ba đã có
// `commands.verify` thật, chỉ là được điền tay chứ không qua `setup.mjs`. Kèm theo là một câu
// SAI: "mọi dòng CHANGEME/lệnh rỗng bên dưới là triệu chứng của nguyên nhân này", trong khi
// bên dưới không có dòng nào như vậy.
//
// Chỗ này đắt hơn một test đỏ oan: mục `CHẶN — sửa trước mọi việc khác` là kênh ưu tiên cao
// nhất của doctor, và giá trị của nó bằng đúng độ tin cậy của nó. Một dòng chặn sai ở đó dạy
// người ta bỏ qua cả mục — đúng cơ chế của `knowledge/lessons/0003`, chỉ khác là lần này nó
// xảy ra với phép TỰ CHẨN ĐOÁN của harness.
//
// Nên: chặn theo KẾT QUẢ (`commands.verify` rỗng), nhắc theo QUY TRÌNH.
if (mf && !mf.profile) {
  const noVerify = !String(cfg.commands?.verify ?? '').trim();
  const say = 'chưa chạy `node tooling/setup.mjs` — nó đọc repo này (package.json/pyproject/go.mod/'
    + 'lockfile) rồi đề xuất `commands` kèm BẰNG CHỨNG, chọn skill/rule theo stack, và ghi ADR 0001.';
  if (noVerify) {
    blocker(`${say} Và \`commands.verify\` đang RỖNG: gate không có gì để chạy, nên mọi dòng `
      + 'CHANGEME/lệnh rỗng bên dưới là triệu chứng của một nguyên nhân này.');
  } else {
    advice.push(`${say} \`commands.verify\` đã có (điền tay) nên KHÔNG gấp — phần bạn đang bỏ là `
      + 'phỏng vấn stack và ADR 0001. Chạy `node tooling/setup.mjs --detect` để so, nó không ghi gì.');
  }
}
if (mf?.profile?.allowedEmptyVerify) {
  blocker('setup.mjs đã chạy với `--allow-empty-verify` — project này KHÔNG có gate verify, và điều đó '
    + 'nằm trong manifest chứ không biến mất. Còn là trạng thái tạm thì được; còn sau tuần đầu thì '
    + 'harness ở đây là trang trí và BẠN vẫn là verification loop.');
}

// ── Phát hành: tag có trỏ vào thứ nằm trên main không? ───────────────────────
// Rebase-merge của GitHub VIẾT LẠI SHA. Tag một commit trước rebase thì tag đó trỏ vào một
// commit KHÔNG nằm trên main — và không gì báo: `git tag` vẫn liệt kê nó, `git show` vẫn mở
// được, chỉ có điều `--ref <tag>` của `upgrade.mjs` sẽ kéo về một cây không ai review.
// Gặp thật 2026-08-05 với v2.7.7. Kiểm rẻ: mọi tag `vX.Y.Z` phải là tổ tiên của main.
if (IS_TEMPLATE && git(['rev-parse', '--git-dir']).status === 0) {
  const tags = git(['tag', '--list', 'v*']).stdout.split('\n').filter(t => /^v\d+\.\d+\.\d+$/.test(t.trim()));
  const orphan = tags.filter(t => git(['merge-base', '--is-ancestor', t.trim(), 'main']).status !== 0);
  if (orphan.length) {
    blockers.push(`${orphan.length} tag KHÔNG nằm trên main: ${orphan.join(' · ')} — gần như chắc chắn là tag đặt vào commit TRƯỚC rebase-merge. `
      + `\`upgrade.mjs --ref <tag>\` sẽ kéo về một cây không ai review. Sửa: git tag -d <tag> && git push --delete origin <tag> rồi tag lại commit trên main.`);
  } else if (tags.length) console.log(`  ✓  ${tags.length} tag phát hành đều nằm trên main`);

  // ── CHIỀU CÒN LẠI: version đã phát hành mà KHÔNG có tag nào ────────────────
  //
  // Check phía trên hỏi *"tag đang có có trỏ đúng chỗ không"*. Dòng xanh của nó đọc như một
  // lời khai về PHÁT HÀNH, nhưng nó không biết gì về version KHÔNG CÓ TAG — và đó là chiều
  // im lặng: `upgrade.mjs --ref <tag>` là đường DUY NHẤT để repo con pin theo tag, còn
  // `knowledge/README.md` thì cấm pin theo `main`.
  const gap = releaseTagGap({
    versions: [...(() => { try { return readFileSync(repoPath('HARNESS-CHANGELOG.md'), 'utf8'); } catch { return ''; } })()
      .matchAll(/^## (\d+\.\d+\.\d+)/gm)].map(m => m[1]),
    tags: tags.map(t => t.trim()),
    current: localVer || mf?.templateVersion || '',
  });
  if (!gap) console.log('  ?    không đọc được changelog hoặc harness.version — không nói được version nào thiếu tag');
  else if (!gap.behind) console.log(`  ✓  tag mới nhất (v${gap.latestTag ?? '?'}) đã bắt kịp version trên main`);
  else {
    console.log(`  ⚠️   tag mới nhất là v${gap.latestTag ?? '(chưa có)'} nhưng main đang ở ${gap.current} — ${gap.behind} version KHÔNG PIN ĐƯỢC`);
    advice.push(`${gap.behind} version đã merge mà không có tag (mới nhất có tag: v${gap.latestTag ?? '—'}). `
      + '`upgrade.mjs --ref <tag>` là đường DUY NHẤT để repo con pin, và `knowledge/README.md` cấm pin theo `main` — '
      + 'nên mọi cải tiến sau tag đó chưa repo nào với tới được. Tag lại: `git tag v<x.y.z> <sha>` rồi `git push --tags`.');
  }
  const localVerTag = `v${localVer}`;
  if (localVer && !tags.includes(localVerTag) && currentBranch() === 'main') {
    advice.push(`harness.version = ${localVer} nhưng CHƯA có tag ${localVerTag} — consumer không pin được version này (\`upgrade --ref\` cần tag có thật)`);
  }
}

// ── Bề mặt vendor: frontmatter skill + rule ──────────────────────────────────
//
// VÌ SAO CHECK NÀY BÁO CÁO CHỨ KHÔNG FAIL: doctor có caller phụ thuộc exit 0,
// và một field lạ là ĐỀ XUẤT xem lại, không phải phán quyết.
//
// GIỮ NGÀY TRÊN DANH SÁCH. Vendor thêm field liên tục; một allowlist không ngày
// sẽ báo một field ĐANG CHẠY là inert — đó là hướng sai làm người ta bỏ qua check.
// Fetch từ code.claude.com/docs/en/skills — 2026-08-04.
const KNOWN_SKILL_KEYS = new Set([
  'name', 'description', 'argument-hint', 'arguments', 'disable-model-invocation',
  'user-invocable', 'allowed-tools', 'disallowed-tools', 'model', 'effort',
  'context', 'agent', 'background', 'hooks', 'paths', 'shell',
]);

// ── Đối chiếu với BẢNG GỐC trong binary, không chỉ với danh sách trên (#94) ──
//
// Danh sách trên là thứ harness cho là HỢP LỆ CHO MỘT SKILL — nó hẹp có chủ ý. Bảng trong
// binary là HỢP NHẤT skill + plugin + agent + output-style (60 key, có `mcpServers`,
// `themes`, `workflows`), nên nhận cả bảng cho một `SKILL.md` là NỚI check chứ không sửa nó.
//
// Dùng bảng gốc để tách hai chuyện mà bản trước gộp làm một:
//   · key vendor KHÔNG có     ⇒ gõ sai, hoặc field harness tự nghĩ ra. Tín hiệu thật.
//   · key vendor CÓ, list chưa⇒ allowlist đang MỤC. Comment trên chỉ CẢNH BÁO điều này;
//                               giờ nó được PHÁT HIỆN, và tự nói khi tới lúc cập nhật.
//
// Và CHUẨN HOÁ trước khi so: vendor đọc key qua `s.replace(/[-_]/g,'').toLowerCase()`, nên
// `whenToUse` ≡ `when_to_use`. Bản trước so chuỗi thô ⇒ báo một key ĐANG CHẠY là lạ. Đúng lớp
// lỗi `dcg` sửa ở v2.36.0: so chuỗi thay vì so thứ mà chuỗi NGHĨA LÀ.
//
// Không đọc được binary ⇒ rơi về hành vi cũ và NÓI RA là chưa xác minh. Ba trạng thái.
const { nativeFrontmatterKeys, normKey } = await import('./native-surface.mjs');
// `claudeCodeVersionMeasured()`, KHÔNG phải regex tự chế trên đường dẫn. Bản đầu của tôi dùng
// `execPath.match(/\d+\.\d+\.\d+/)` và in ra "Claude Code 24.18.0" — đó là version NODE, lấy
// từ đoạn `nvm/v24.18.0/` trong chính đường dẫn. Một con số trông đúng và sai.
const { claudeCodeVersionMeasured } = await import('./rituals.mjs');
const ccVersion = claudeCodeVersionMeasured() || '';
const vendorKeys = nativeFrontmatterKeys();
const vendorSet = vendorKeys ? new Set(vendorKeys.map(normKey)) : null;
const knownNorm = new Set([...KNOWN_SKILL_KEYS].map(normKey));
const nfkWhy = process.env.CLAUDE_CODE_EXECPATH
  ? 'không match được bảng key trong binary' : 'CLAUDE_CODE_EXECPATH không được đặt';
// Claude Code CHỈ đọc `paths` trong .claude/rules/*.md. Năm trường còn lại là đầu
// vào cho entropy-scan.mjs — hợp lệ, có người đọc thật, nhưng KHÔNG được vendor
// cưỡng chế. Gọi đúng tên để repo thứ N không tưởng chúng là cấu hình.
const CC_RULE_KEYS = new Set(['paths']);
const HARNESS_RULE_KEYS = new Set(['owner', 'added', 'expires-review', 'why', 'exit-condition']);

console.log('\n── BỀ MẶT VENDOR ──');
const { readdirSync } = await import('node:fs');
const fmKeys = (txt) => {
  const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/);          // CHỈ khối frontmatter,
  if (!m) return [];                                            // không phải cả file —
  return [...m[1].matchAll(/^([A-Za-z][\w-]*):/gm)].map(x => x[1]); // văn xuôi NHẮC tới một
};                                                               // key không phải là KHAI nó.

let skillTotal = 0, discoverable = 0, grantsWrite = [];
const skillNames = new Set();
const unknownKeys = [];
const staleAllowlist = [];   // key vendor CÓ mà allowlist chưa biết — allowlist mục, không phải skill sai
const skillsDir = repoPath('.claude', 'skills');
if (exists(skillsDir)) {
  for (const name of readdirSync(skillsDir)) {
    const f = repoPath('.claude', 'skills', name, 'SKILL.md');
    if (!exists(f)) continue;
    skillTotal++;
    skillNames.add(name);
    const txt = readFileSync(f, 'utf8');
    const keys = fmKeys(txt);
    const fm = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
    if (!/^disable-model-invocation:\s*true/m.test(fm)) discoverable++;
    // allowed-tools CẤP quyền (dùng không cần hỏi). Trường HẠN CHẾ là disallowed-tools.
    // Thân skill nói "không ra thay đổi" mà frontmatter tiền-duyệt Write = mâu thuẫn.
    if (/^allowed-tools:.*\b(Write|Edit)\b/m.test(fm)
        && /không ra thay đổi|KHÔNG tự sửa|chỉ đọc|DỪNG, báo cáo/i.test(txt)) grantsWrite.push(name);
    for (const k of keys) {
      if (knownNorm.has(normKey(k))) continue;
      // Hai chuyện khác nhau, hai câu khác nhau — xem khối comment ở KNOWN_SKILL_KEYS.
      if (vendorSet?.has(normKey(k))) staleAllowlist.push(`skill/${name}: ${k}`);
      else unknownKeys.push(`skill/${name}: ${k}`);
    }
  }
}
const skillCap = cfg.limits?.maxSkills ?? 12;
console.log(`  skill: ${skillTotal} tổng · ${discoverable} model tự gọi được (trần ${skillCap})`);
if (discoverable > skillCap) advice.push(`${discoverable} skill trong tầng discovery (trần ${skillCap}) — mỗi cái trả tiền thuê \`description\` MỌI phiên. Thêm \`disable-model-invocation: true\` cho skill nghi thức: chi phí context về 0, không mất chức năng`);
for (const g of grantsWrite) advice.push(`skill \`${g}\`: thân nói KHÔNG ra thay đổi nhưng \`allowed-tools\` tiền-duyệt Write/Edit. Trường HẠN CHẾ là \`disallowed-tools\` — đây là template, nó DẠY thói quen cho mọi repo nhận nó`);

// ── AI đã tiêu trần skill? ───────────────────────────────────────────────────
// Trần `maxSkills` được ĐO nhưng không ai NÓI ai đã tiêu nó. Đo thật ở `warehouse`
// (2026-08-03): `prisma init` tự đổ **9 skill** của Prisma vào `.claude/skills/` và tạo
// `skills-lock.json` + `.agents/` + `.windsurf/`. Trần của harness là 12 — một lệnh `init`
// của bên thứ ba vừa ăn gần hết ngân sách discovery, và dòng duy nhất người dùng thấy là
// `skill: 21 (trần 12)`. Con số đó KHÔNG nói nguyên nhân, nên nó dẫn tới kết luận sai:
// "harness của mình phình" thay vì "một tool vừa ghi vào .claude/ của mình".
//
// Tín hiệu sẵn có: `.claude/harness-manifest.json → files` liệt kê mọi file cơ chế template
// đã ship, kể cả từng `SKILL.md`. Skill có trên đĩa mà KHÔNG có trong manifest là skill do
// project hoặc một tool thêm vào. Không đoán theo tên, không cần danh sách phải bảo trì.
if (mf?.files && skillNames.size) {
  const shipped = new Set(Object.keys(mf.files)
    .filter(f => f.startsWith('.claude/skills/'))
    .map(f => f.split('/')[2]));
  const added = [...skillNames].filter(n => !shipped.has(n));
  const TOOL_TELLS = ['skills-lock.json', '.agents', '.windsurf', '.cursor'];
  const tells = TOOL_TELLS.filter(t => exists(repoPath(t)));
  if (added.length) {
    advice.push(`${added.length} skill KHÔNG do template ship: ${added.slice(0, 8).join(' · ')}${added.length > 8 ? ` … +${added.length - 8}` : ''}`
      + (tells.length ? ` — và có ${tells.join(' · ')} ở gốc repo, dấu vết một tool bên thứ ba tự ghi vào .claude/.` : '')
      + ` Đây có thể là skill của ĐỘI (tốt) hoặc do một lệnh \`init\` đổ vào (xoá đi). Trần discovery là ${skillCap};`
      + ` skill nào giữ lại mà không cần model tự gọi thì thêm \`disable-model-invocation: true\` — chi phí context về 0.`);
  }
}

const rulesDir = repoPath('.claude', 'rules');
let rulesNoPaths = 0;
if (exists(rulesDir)) {
  for (const name of readdirSync(rulesDir).filter(f => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md')) {
    const keys = fmKeys(readFileSync(repoPath('.claude', 'rules', name), 'utf8'));
    if (!keys.includes('paths')) rulesNoPaths++;
    for (const k of keys) if (!CC_RULE_KEYS.has(k) && !HARNESS_RULE_KEYS.has(k)) unknownKeys.push(`rule/${name}: ${k}`);
  }
  console.log(`  rule: ${readdirSync(rulesDir).filter(f => f.endsWith('.md')).length} file · ${rulesNoPaths} không có \`paths\` (nạp cho MỌI request)`);
  if (rulesNoPaths > 3) advice.push(`${rulesNoPaths} rule không có \`paths\` — mỗi cái là thuế context cho mọi người ở mọi request. Trần hợp lý: 3–5 rule an toàn toàn cục`);
}
for (const u of unknownKeys) advice.push(`frontmatter key lạ — ${u} — `
  + (vendorSet
    ? `KHÔNG có trong bảng ${vendorSet.size} key của binary Claude Code ${ccVersion || ''}. Gõ sai, hoặc field harness tự nghĩ ra mà vendor không đọc`
    : `allowlist cập nhật 2026-08-04, và lần này KHÔNG đối chiếu được với binary (${nfkWhy}) — chưa xác minh, đừng đọc thành "đã kiểm"`));
for (const s of staleAllowlist) advice.push(`allowlist ĐANG MỤC — ${s}: vendor CÓ đọc key này, `
  + `\`KNOWN_SKILL_KEYS\` trong harness-doctor thì chưa biết. Skill không sai; danh sách sai. Thêm key vào đó`);
if (vendorSet && !staleAllowlist.length && !unknownKeys.length) {
  console.log(`  frontmatter: ${knownNorm.size} key curated, đối chiếu ${vendorSet.size} key ĐO TỪ BINARY — không lệch`);
} else if (!vendorSet) {
  console.log(`  frontmatter: KHÔNG đối chiếu được với binary (${nfkWhy}) — allowlist chưa xác minh, đây không phải "ok"`);
}

// ── Danh mục công cụ: SINH, không gõ tay ─────────────────────────────────────
//
// Mọi thứ máy biết được thì sinh ra. Một bảng hook viết tay trong README lệch
// khỏi thực tế mà không ai thấy — và hai trong ba dòng thiếu thường là loại
// CHẶN được lệnh ghi file.
console.log('\n── DANH MỤC HOOK ──');
const settings = readJson(repoPath('.claude', 'settings.json'), {});

// ── `settings.local.json`: ĐỌC, nhưng không bao giờ làm nó thành gate ────────
//
// ĐIỂM MÙ được consumer báo lên 2026-08-05: doctor và entropy-scan chưa từng đọc NỘI DUNG
// file này (doctor chỉ kiểm nó có bị track không). Hệ quả đo được ở repo đó: hai deny rule
// sống trong `settings.local.json`, doctor vẫn báo "thiếu" — và bốn hook cắm ở đó thì VÔ HÌNH,
// nên một canary đăng ký TRÙNG với `settings.json` chạy gate HAI LẦN mà không gì phát hiện.
// Ở `SubagentStop` con số đó nhân với tối đa 16 agent song song.
//
// VÌ SAO KHÔNG BAO GIỜ LÀ GATE. File này là máy-cục-bộ và không commit (Parity Contract).
// Một check đọc nó cho kết quả KHÁC NHAU trên mỗi máy, và một gate khác nhau trên mỗi máy
// thì không phải gate — nó là chỗ để tranh luận "trên máy tôi xanh mà". Nên mọi phát hiện từ
// đây đi vào `advice`, luôn kèm chữ "MÁY NÀY", và KHÔNG bao giờ vào `blockers`.
const localSettings = readJson(repoPath('.claude', 'settings.local.json'), {});
const localDeny = localSettings.permissions?.deny ?? [];

const wired = new Map();                                  // file → [event…]
for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
  for (const g of groups ?? []) for (const h of g.hooks ?? []) {
    const m = String(h.command ?? '').match(/hooks[\/\\]([\w.-]+\.mjs)/);
    if (m) wired.set(m[1], [...(wired.get(m[1]) ?? []), event]);
  }
}

// ĐĂNG KÝ TRÙNG: cùng một lệnh, cùng một sự kiện, ở CẢ HAI file. Claude Code hợp nhất hai
// file chứ không cho file local ghi đè, nên hook chạy HAI LẦN. Chế độ hỏng của nó không phải
// lỗi — là ngân sách: `AGENTS.md` cho `SubagentStop` đúng 5 giây, và chạy hai lần thì trần
// thật là 2.5 giây, nhân với tối đa 16 agent song song. Không có gì báo, vì cả hai đăng ký
// đều hợp lệ.
{
  const sig = (ev, cmd) => `${ev}\u0000${String(cmd).trim()}`;
  const inShared = new Set();
  for (const [ev, groups] of Object.entries(settings.hooks ?? {})) {
    for (const g of groups ?? []) for (const h of g.hooks ?? []) inShared.add(sig(ev, h.command));
  }
  const dup = [];
  for (const [ev, groups] of Object.entries(localSettings.hooks ?? {})) {
    for (const g of groups ?? []) for (const h of g.hooks ?? []) {
      if (inShared.has(sig(ev, h.command))) dup.push(`${ev} → ${String(h.command).trim()}`);
    }
  }
  if (dup.length) {
    advice.push(`${dup.length} hook đăng ký TRÙNG ở \`settings.json\` VÀ \`settings.local.json\` (MÁY NÀY) ⇒ chạy HAI LẦN:`
      + dup.map(d => `\n         · ${d}`).join('')
      + `\n         Claude Code HỢP NHẤT hai file, không ghi đè. Gỡ khỏi \`settings.local.json\`.`
      + (dup.some(d => d.startsWith('SubagentStop')) ? ` Ở \`SubagentStop\` ngân sách là 5 GIÂY và nó nhân với tối đa 16 agent song song.` : ''));
  }
}
// Bằng chứng hook ĐÃ CHẠY. Ba tình huống sau đọc GIỐNG HỆT NHAU nếu không đếm:
// hook chạy suốt tuần không bắt gì (TỐT) · hook không được cắm (mã chết) · hook crash
// im lặng (hỏng). `hookRan()` ghi nhánh cho-qua; `gate-fails` ghi nhánh chặn.
// KHÔNG có dữ liệu là `?` (CHƯA ĐO ĐƯỢC), KHÔNG phải `0` — gộp hai cái đó là cách một
// cái gác đang làm việc bị đề xuất xoá.
const tally = (file, field = 2, dir = repoPath('.claude', 'telemetry'), sinceMs = 0) => {
  if (!exists(join(dir, file))) return new Map();
  return tallyLines(readFileSync(join(dir, file), 'utf8'), { field, sinceMs });
};
const hookRuns = tally('hook-runs.log');
const hookBlocks = tally('gate-fails.log');

// ── BẰNG CHỨNG THỨ HAI: telemetry mà SUITE để lại ────────────────────────────
//
// Lời khuyên cũ ở đây là "không có dòng nào trong log ⇒ chạy `node tooling/test-hooks.mjs`".
// Nó là NGÕ CỤT, và đo được: suite CỐ Ý chuyển telemetry sang `TEST_TELEMETRY_DIR`
// (test-hooks.mjs dòng ~37, có lý do viết rõ — không chuyển thì suite tự bơm số vào bộ đếm
// mà `/harness-retro` bước 4 dùng để đề xuất CẮT BỎ). Nên chạy suite KHÔNG BAO GIỜ tạo được
// dòng nào ở nơi doctor đang nhìn: làm đúng lời khuyên, kết quả không đổi, mãi mãi.
// Đo 2026-08-06: 7/10 hook dính lời khuyên này ở mỗi lần chạy.
//
// Bằng chứng thì đã có sẵn — chỉ nằm ở thư mục kia. `harness-doctor` CHẠY suite như bước
// đầu tiên của chính nó (dòng 25), nên khi tới được đây, `TEST_TELEMETRY_DIR` chứa dấu vết
// spawn THẬT của các hook, vừa mới, từ chính lần chạy này.
//
// Hai loại bằng chứng KHÔNG được gộp làm một, vì chúng trả lời hai câu khác nhau:
//   · telemetry THẬT  → "hook đã GẶP CA CỦA NÓ trong việc thật"
//   · telemetry SUITE → "hook CHẠY ĐƯỢC, không crash im lặng" (nhưng ca thật chưa tới)
// Chỉ khi KHÔNG có cả hai thì im lặng mới là một câu hỏi — và lúc đó lời khuyên mới có việc.
//
// CHỈ ĐẾM DÒNG CỦA CHÍNH LẦN CHẠY NÀY (`RUN_STARTED`). Thư mục kia nằm ở `tmpdir()` và sống
// dai hơn một lần chạy, nên không lọc thì một lần chạy suite HÔM QUA vẫn đọc là "suite ✓"
// hôm nay — kể cả khi hôm nay suite crash, bị gỡ khỏi danh sách check, hay ai đó đảo thứ tự
// hai bước. Đó lại đúng lớp lỗi mà cả mục này sinh ra để diệt, chỉ đổi chỗ đứng.
// Lọc theo mốc thì nó hỏng về phía an toàn: mất bằng chứng ⇒ tụt về `?`, không thành lời
// khẳng định sai.
const suiteRuns = tally('hook-runs.log', 2, TEST_TELEMETRY_DIR, RUN_STARTED);
const suiteBlocks = tally('gate-fails.log', 2, TEST_TELEMETRY_DIR, RUN_STARTED);

const applyTo = exists(repoPath('tooling', 'apply-to.mjs')) ? readFileSync(repoPath('tooling', 'apply-to.mjs'), 'utf8') : '';
// Khớp cả '.claude/hooks' (thư mục) lẫn '.claude/hooks/x.mjs' (file lẻ). Bản đầu
// của check này đòi dấu `/` cuối và cho DƯƠNG TÍNH GIẢ ngay lần chạy đầu tiên:
// PHẠM VI của check sai, không phải logic của nó — đúng chỗ cần nhìn trước tiên.
const carriesHooks = /['"]\.claude\/hooks(['"/])/.test(applyTo);
const onDisk = exists(repoPath('.claude', 'hooks'))
  ? readdirSync(repoPath('.claude', 'hooks')).filter(f => f.endsWith('.mjs')) : [];
for (const f of onDisk) {
  const events = wired.get(f);
  const src = readFileSync(repoPath('.claude', 'hooks', f), 'utf8');
  const canBlock = /\bblock\(|EXIT_BLOCK|exit\(2\)/.test(src);
  const name = f.replace(/\.mjs$/, '');
  const passes = Object.values(hookRuns.get(name) ?? {}).reduce((a, b) => a + b, 0);
  const blocks = Object.values(hookBlocks.get(name) ?? {}).reduce((a, b) => a + b, 0);
  const inSuite = suiteRuns.has(name) || suiteBlocks.has(name);
  // `fired` của một hook KHÔNG có đường exit 2 là `n/a`, không phải `0`.
  // Gộp hai giá trị đó là cách một bảng nói "cái gác này vô dụng" về một cái gác đang làm việc.
  // Và "suite chạy được nó" là một GIÁ TRỊ THỨ BA, không phải một dạng của `?`: nó loại trừ
  // crash im lặng mà KHÔNG giả vờ rằng ca thật đã từng tới.
  const runCol = passes || blocks
    ? `${passes} qua · ${canBlock ? `${blocks} chặn` : 'n/a chặn'}`
    : inSuite ? 'suite ✓ · ca thật chưa tới' : '? chưa đo';
  console.log(`  ${events ? '✓' : '✗'} ${f.padEnd(28)} ${(events ? events.join(',') : 'KHÔNG CẮM').padEnd(22)} ${(canBlock ? 'chặn được' : 'chỉ nhắc (n/a)').padEnd(15)} ${runCol}`);
  if (!events) advice.push(`hook \`${f}\` có trên đĩa nhưng KHÔNG có trong settings.json — mã chết trông như đang sống`);
  // "CHƯA ĐO ĐƯỢC" ≠ "0 lần". Chỉ nói khi log đã có dữ liệu của hook KHÁC: lúc đó
  // sự im lặng của hook này mới là một câu hỏi, không phải một hệ quả của việc chưa chạy gì.
  else if (!passes && !blocks && !inSuite && hookRuns.size) {
    advice.push(`hook \`${f}\` đã cắm nhưng KHÔNG để lại dòng nào — cả ở telemetry thật LẪN ở telemetry của suite `
      + `(${TEST_TELEMETRY_DIR}), trong khi hook khác có ở cả hai. Suite VỪA chạy trong chính lần doctor này, nên `
      + `đây không phải "chưa chạy suite": hoặc đường đi của hook không gọi \`hookRan()\`/\`telemetry('gate-fails')\`, `
      + `hoặc nó crash im lặng. Nhánh nào chặn mà không ghi sổ thì \`/harness-retro\` bước 4 sẽ thấy nó là gác vô dụng và đề xuất cắt.`);
  }
}
if (!carriesHooks && onDisk.length) advice.push('apply-to.mjs không mang `.claude/hooks/` — repo tiêu thụ sẽ nhận settings.json trỏ vào file không tồn tại');

// ── LỆCH giữa ĐIỀU CẤM VIẾT RA và ĐIỀU GUARD CƯỠNG CHẾ ──────────────────────
//
// Hai nửa, và không nửa nào tự thấy nửa kia đang trôi:
//   · một điều cấm CHỈ nằm trong guard  ⇒ được cưỡng chế nhưng KHÔNG ai biết. Người đọc
//     `AGENTS.md` tưởng đường dẫn đó sửa được, rồi bị chặn bởi một luật chưa từng đọc —
//     và một cú chặn không giải thích được là cú chặn làm người ta đi tìm cách tắt guard.
//   · một điều cấm CHỈ nằm trong văn bản ⇒ ai cũng biết nhưng KHÔNG gì chặn. Đây là dạng
//     tệ hơn: nó ĐỌC như một lớp bảo vệ.
//
// Cơ chế lấy từ `fleet/.claude/scripts/claude-md-budget.mjs` (`governanceTokens`), nơi nó
// sinh ra từ một phép đo 2026-08-01: `CLAUDE.md` của họ ghi 7 bề mặt quản trị và nói
// *"enforced by autonomy-gate"* — gate thật giữ 12. Lệch CẢ HAI CHIỀU, và
// `.claude/agents/**` (system prompt của subagent) không có ở CẢ HAI: không ai gác, suốt
// thời gian thư mục đó tồn tại.
//
// Harness đo cùng ngày, cùng kết quả về hình dạng: `paths.harness` cưỡng chế 8 lớp,
// dòng CẤM trong `AGENTS.md` nêu 5. Ba lớp — `.claude/rules/**`, `CLAUDE.md`,
// `.github/CODEOWNERS` — bị chặn mà chưa từng được nói ra.
//
// SO TỪ KHOÁ, KHÔNG SO MẪU. Đây là phần fleet phải học lần thứ hai: khớp regex của guard
// với văn xuôi thì giòn theo đúng kiểu *"luật đúng, cái thước ngắn"*, và một check kêu oan
// về cách hành văn sẽ bị xoá. Cái đáng bắt là một LỚP bị thiếu hẳn.
const agentsTxt = exists(repoPath("AGENTS.md")) ? readFileSync(repoPath("AGENTS.md"), "utf8") : "";
if (agentsTxt) {
  // Phần PHÁN ĐOÁN nằm ở `lib/harness.mjs` (`governanceDrift` / `prohibitionText`) — hàm THUẦN,
  // test khẳng định trực tiếp vào đó. Ở đây chỉ còn phần THU THẬP. Tách như vậy là bắt buộc chứ
  // không phải cho gọn: `harness-doctor` CHẠY `test-hooks.mjs` (dòng 25), nên một test kiểm
  // check này bằng cách spawn `harness-doctor` sẽ đệ quy lẫn nhau — đã đo, suite treo >120 giây.
  const banText = prohibitionText(agentsTxt);
  const enforced = pathsFor("harness");
  // Một đường dẫn có thể được cưỡng chế qua `paths.*` HOẶC bằng chuỗi viết thẳng trong hook:
  // `features/_index.json` do `protect-feature-files.mjs` chặn bằng `rel.endsWith("_index.json")`.
  // Không nhìn chỗ thứ hai thì check báo "không gì chặn" về một thứ đang bị chặn — tức là nó nói
  // y hệt cái nó tồn tại để phát hiện.
  const groups = Object.keys(config().paths ?? {}).filter(k => !k.startsWith("$"));
  const hookSrc = onDisk.map(f => readFileSync(repoPath(".claude", "hooks", f), "utf8")).join("\n");
  const matched = (pth) => {
    // Glob thư mục (`x/**`) KHÔNG khớp chính đường dẫn thư mục, nên phải thử bằng một con giả
    // bên trong. Bỏ `/**` rồi so là lý do bản đầu báo `.claude/hooks/**` là không được cưỡng
    // chế, trong khi nó là mục ĐẦU TIÊN của `paths.harness`.
    const probes = [pth, pth.replace(/\/\*+$/, "/probe.txt"), pth.replace(/^\//, "")];
    if (groups.some(g => probes.some(x => matchAny(x, pathsFor(g))))) return true;
    const base = pth.split("/").filter(s => s && s !== "**").pop() ?? "";
    return Boolean(base && hookSrc.includes(base));
  };
  const { unspoken, unenforced } = governanceDrift({ enforced, banText, matched });
  const live = enforced.filter(g => typeof g === "string" && g && !g.startsWith("!"));
  if (unspoken.length) {
    advice.push(`${unspoken.length}/${live.length} lớp bị \`protect-harness\` CHẶN mà dòng CẤM trong AGENTS.md không nêu: `
      + unspoken.map(g => `\`${g}\``).join(" · ")
      + `\n         Người đọc AGENTS.md tưởng sửa được, rồi bị chặn bởi một luật chưa từng đọc.`
      + `\n         Sửa: thêm chúng vào dòng "**KHÔNG sửa**:" của AGENTS.md — hoặc bỏ khỏi \`paths.harness\` nếu không còn muốn chặn.`);
  }
  if (unenforced.length) {
    advice.push(`${unenforced.length} đường dẫn được AGENTS.md CẤM mà KHÔNG gì cưỡng chế: `
      + unenforced.map(pth => `\`${pth}\``).join(" · ")
      + `\n         Một điều cấm chỉ nằm trong văn bản thì ĐỌC như một lớp bảo vệ. Cắm nó vào \`paths.*\`, hoặc nói rõ trong AGENTS.md rằng nó là quy ước chứ không phải cổng.`);
  }
}

// ── Con số MÁY ĐẾM ĐƯỢC mà NGƯỜI gõ tay trong tài liệu vào-cửa ───────────────
// Nguyên lý: thứ máy đếm được thì không bao giờ gõ tay. Ở đây KHÔNG sinh được cả
// trang — README là văn xuôi của người, không phải bảng — nên luật yếu đi đúng một
// bậc và vẫn cùng hướng: người gõ số thì MÁY kiểm số.
//
// Vì sao là một check chứ không phải một lần sửa: đo 2026-08-04, README ghi
// "9 hook" (thật 10) và "28 test cho hook" (thật 70) — CÙNG LÚC, trong file người
// mới đọc ĐẦU TIÊN. Hai số sai đó không làm gì hỏng; chúng dạy người đọc rằng tài
// liệu này không đáng tin, và sau đó họ cũng không đọc phần đáng tin. Sửa hai số
// là sửa hai lần. KHÔNG sinh cả trang là cố ý: bản sinh-trang ở nơi khác tốn 441
// dòng + 533 dòng test để chữa đúng lớp lỗi này — với một README một trang thì đó
// là cái giá của việc phình, trả bằng chính ngân sách mà ratchet đang canh.
const readmeTxt = exists(repoPath('README.md')) ? readFileSync(repoPath('README.md'), 'utf8') : '';
if (readmeTxt) {
  const hooksRun = results.find(r => r.id === 'hooks');
  // Đếm từ CHÍNH lần chạy này, không hardcode. Suite ĐỎ ⇒ số PASS là một phần chứ
  // không phải tổng: theo luật ba giá trị đó là "chưa đo được", không phải một số
  // nhỏ hơn — so một con số thật với một con số phần sẽ báo lệch ở nơi không lệch.
  const testCount = hooksRun?.status === 'pass' ? (hooksRun.out.match(/^\s*PASS\b/gm) ?? []).length : null;
  // `floor` cho số TEST, khớp CHÍNH XÁC cho số hook/skill. Lý do đo được: chỉ trong
  // phiên này số test đi 28 → 70 → 71, và một check nổ mỗi lần thêm một test là check
  // dạy người ta ngừng đọc. Số hook/skill là CẤU TRÚC (thêm một cái là một quyết định),
  // số test chỉ tăng — nên với nó, cái đáng chặn là chiều NÓI QUÁ, không phải chiều tụt hậu.
  const CLAIMS = [
    { re: /(\d+)\s+hook\b/,        real: onDisk.length, what: 'hook' },
    { re: /(\d+)\s+skill\b/,       real: skillTotal,    what: 'skill' },
    { re: /(\d+)\s+test cho hook/, real: testCount,     what: 'test cho hook', floor: true },
  ];
  const parts = [];
  for (const c of CLAIMS) {
    const m = readmeTxt.match(c.re);
    // In cả trạng thái "không khai" và "chưa đo được": im lặng KHÔNG được đọc thành
    // đã kiểm. Xoá con số khỏi README là cách hợp lệ để thoát check này — nhưng nó
    // phải nhìn thấy được, không phải một check tự tắt mà không ai hay.
    if (!m) { parts.push(`${c.what}: không khai`); continue; }
    if (c.real === null) { parts.push(`${c.what}: ${m[1]} vs ? chưa đo`); continue; }
    const claimed = Number(m[1]);
    if (c.floor ? claimed <= c.real : claimed === c.real) {
      parts.push(`${c.what}: ${m[1]}${c.floor && claimed < c.real ? `≤${c.real}` : ''} ✓`);
      continue;
    }
    parts.push(`${c.what}: ${m[1]} ${c.floor ? '>' : '≠'} ${c.real}`);
    advice.push(`README.md ghi "${m[0].trim()}" nhưng đo được ${c.real} — `
      + (c.floor ? 'README NÓI QUÁ so với thực tế. ' : 'con số máy đếm được thì đừng gõ tay. ')
      + `Đây là tài liệu VÀO-CỬA: một con số sai ở đây dạy người mới rằng tài liệu này không đáng tin`);
  }
  console.log(`  README, số máy đếm được:     ${parts.join(' · ')}`);
}

// ── Tham chiếu tới một skill KHÔNG TỒN TẠI ───────────────────────────────────
// Xoá một skill là MỘT lệnh; tìm hết chỗ đang nhắc nó thì không. Đo 2026-08-04: xoá
// skill whats-new để lại NĂM tham chiếu chết — test-hooks.mjs, lib/harness.mjs,
// docs/TEAM.md, docs/ANTI-PATTERNS.md, và docs/adr/0002 (nơi ghi thẳng "KHÔNG xoá" nó).
//
// TÊN SKILL Ở COMMENT NÀY CỐ Ý KHÔNG VIẾT DẠNG slash-trong-backtick: check quét cả comment (tham chiếu
// thật cũng nằm trong comment, xem test-hooks.mjs), nên một comment GIẢI THÍCH check bằng
// đúng cú pháp check đi tìm sẽ tự tố giác mình. Đã xảy ra 2 lần trong lần viết file này.
// Không tool nào bắt được: `entropy-scan` kiểm link file, không kiểm tên lệnh.
//
// Một tham chiếu chết không làm gì hỏng — nó dạy người đọc rằng tài liệu này không đáng
// tin, và sau đó họ không đọc phần đáng tin.
//
// LOẠI TRỪ theo bản chất, không theo tiện lợi: changelog · whats-new · ADR · learnings là
// **hồ sơ lịch sử**, chúng PHẢI được phép nhắc tên một skill đã bị xoá — đó là việc của
// chúng. Mọi file khác thì không.
const NATIVE_OR_NOT_A_SKILL = new Set([
  // Lệnh NATIVE của Claude Code + thứ trông giống lệnh mà không phải (`/tmp`).
  // Cập nhật 2026-08-04: vendor thêm lệnh thì thêm vào đây, đừng bỏ qua check.
  'clear', 'context', 'compact', 'doctor', 'help', 'memory', 'skills', 'plugin', 'verify', 'tmp',
]);
// `docs/progress/` là NHẬT KÝ — cùng bản chất với changelog/ADR/learnings, chỉ khác định dạng.
// Nó ghi *"ngày X tôi quyết KHÔNG cắt hai chỗ nhắc skill whats-new vì chúng là bia mộ"*, và
// nó KHÔNG THỂ ghi câu đó mà không gọi tên thứ đã bị xoá. Đó là việc của nó.
//
// (Tên skill ở comment này cố ý KHÔNG viết dạng slash-trong-backtick — xem cảnh báo ở khối
// comment dưới. Lần viết bản vá này là lần THỨ BA cái bẫy đó bắt được người đang sửa nó.)
//
// Đo 2026-08-07: dòng advice này bắn ở MỌI lần chạy doctor, về một quyết định đã được phán
// xử bằng văn bản trong chính file bị tố — nhật ký vòng học tuần W32, dòng 93. (Không viết
// đường dẫn nhật ký ở đây: thư mục đó không được ship xuống repo tiêu thụ, nên trích dẫn dạng
// đường dẫn trong file NÀY thành con trỏ chết ở mọi repo con.) Nhật ký
// đó còn xếp nó vào bảng "BÀI HỌC ĐẮT NHẤT CỦA PHIÊN" như một trong BA lần output của harness
// suýt làm hỏng một cơ chế đang chạy. Một cảnh báo vĩnh viễn về việc không được làm là đúng
// lớp lỗi #56 — và nó dạy người đọc bỏ qua mục advice, tức làm hỏng cả những mục đúng.
const HISTORICAL = /^(HARNESS-CHANGELOG\.md|\.claude\/whats-new\.md|docs\/adr\/|\.claude\/learnings\/|docs\/progress\/)/;
const deadRefs = new Map();
for (const f of git(['ls-files']).stdout.split('\n').filter(Boolean)) {
  if (!/\.(md|mjs)$/.test(f) || HISTORICAL.test(f)) continue;
  let txt = ''; try { txt = readFileSync(repoPath(f), 'utf8'); } catch { continue; }
  for (const m of txt.matchAll(/`\/([a-z][a-z0-9-]*)`/g)) {
    const n = m[1];
    if (skillNames.has(n) || NATIVE_OR_NOT_A_SKILL.has(n)) continue;
    // Bia mộ + migration thi hành việc xoá là HỒ SƠ LỊCH SỬ viết bằng code — cùng bản chất
    // với changelog/ADR ở `HISTORICAL`, chỉ khác định dạng. Xem `isRecordedRemoval` ở lib.
    if (isRecordedRemoval(n, f)) continue;
    if (!deadRefs.has(n)) deadRefs.set(n, new Set());
    deadRefs.get(n).add(f);
  }
}
for (const [n, files] of deadRefs) {
  advice.push(`\`/${n}\` được nhắc ở ${[...files].join(', ')} nhưng KHÔNG có .claude/skills/${n}/SKILL.md — `
    + `tham chiếu chết. Sửa chỗ nhắc, hoặc dựng lại skill. (Lệnh native mới của vendor? Thêm vào NATIVE_OR_NOT_A_SKILL)`);
}

// ── Cửa thoát trong CI: ai canh nó? ──────────────────────────────────────────
// `ci.yml` job `verify` đặt HARNESS_ALLOW_SKIPPED_GATES=1 vì ở REPO TEMPLATE, `commands`
// rỗng là placeholder đúng và không có dòng đó thì CI template đỏ vĩnh viễn.
//
// Ở REPO TIÊU THỤ, cùng dòng đó nghĩa là: gate bị bỏ qua vẫn cho ra tick XANH. Đó là
// đúng hình dạng lỗi mà cả job `verify` vừa được sửa để diệt — cửa thoát không có người
// canh thì thành vĩnh viễn, và nó vĩnh viễn ở đúng chỗ nguy hiểm nhất.
//
// Tín hiệu dùng `.claude/harness-manifest.json` (chỉ `apply-to`/`upgrade` ghi ra ở ĐÍCH,
// không bao giờ có ở template). Lỗ đã biết: repo copy tay không có manifest sẽ đọc thành
// template — doctor vốn đã khuyên chạy `upgrade.mjs` một lần chính vì lý do này.
const ciPath = repoPath('.github', 'workflows', 'ci.yml');
if (exists(ciPath) && readFileSync(ciPath, 'utf8').includes('HARNESS_ALLOW_SKIPPED_GATES')) {
  if (exists(repoPath('.claude', 'harness-manifest.json'))) {
    blockers.push('.github/workflows/ci.yml còn `HARNESS_ALLOW_SKIPPED_GATES: 1` nhưng đây là repo TIÊU THỤ '
      + '(có .claude/harness-manifest.json) — gate bị bỏ qua vẫn cho tick XANH. XOÁ dòng env đó khỏi job `verify`, '
      + 'rồi điền harness.config.json → commands cho tới khi gate xanh THẬT');
  } else {
    console.log('  cửa thoát CI:                HARNESS_ALLOW_SKIPPED_GATES có mặt — ĐÚNG ở template (chưa có manifest)');
  }
}

// Deny rule là lớp 2 cho hai hook glob-tĩnh. Deny rule KHÔNG test được bằng spawn hook,
// nên chỗ nó được kiểm là ĐÂY — nếu không, xoá nó đi cũng không ai biết.
const deny = settings.permissions?.deny ?? [];
const WANT_DENY = ['Edit(**/*.gen.*)', 'Edit(/features/_index.json)'];
for (const d of WANT_DENY) {
  if (deny.includes(d)) continue;
  // `settings.local.json` là MÁY-CỤC-BỘ và không commit — nên "thiếu ở settings.json" và
  // "không tồn tại" là HAI câu khác nhau, và bản trước gộp chúng. Consumer báo lên đúng ca
  // này 2026-08-05: hai deny rule đang sống trong `settings.local.json`, doctor vẫn nói
  // "thiếu", và người đọc đã thêm chúng rồi nên học được rằng doctor nói sai.
  //
  // Câu đúng cho ca đó KHÔNG phải "đã có, bỏ qua" — mà là một câu KHÁC và tệ hơn theo nghĩa
  // team: rule đang bảo vệ MỘT máy, cả đội không có nó. Nói được câu đó thì mới sửa được.
  advice.push(localDeny.includes(d)
    ? `deny rule \`${d}\` CHỈ có trong \`settings.local.json\` — nó bảo vệ MÁY NÀY, cả đội KHÔNG có nó. `
      + `File đó không commit (đúng), nên chuyển rule sang \`settings.json\` nếu muốn nó là luật của team.`
    : `thiếu deny rule \`${d}\` — hook tương ứng chỉ khớp Write|Edit, deny rule phủ thêm \`sed -i\`/\`cat >\` trong Bash và hợp nhất vào ranh giới sandbox`);
}
for (const d of deny) if (/^(Write|NotebookEdit|Glob|MultiEdit)\(/.test(d)) advice.push(`deny rule \`${d}\` KHÔNG BAO GIỜ được tra cứu — Claude Code chỉ kiểm file theo \`Edit(path)\` và \`Read(path)\`. Đổi thành \`Edit(...)\``);

// ── Điểm mở rộng native còn TRỐNG ────────────────────────────────────────────
//
// Anthropic ship điểm mở rộng RỖNG: hook có cơ chế nhưng không có nội dung. Đó không
// phải thiếu sót — nội dung là đặc thù repo. Nhưng một điểm mở rộng để trống thì không
// ai nhìn thấy nó trống, nên nó ở đây. Chỉ liệt kê 5 sự kiện mà harness này CÓ sẵn
// việc cho chúng làm — không liệt kê cả 31 sự kiện, đó sẽ là nhiễu.
const NATIVE_SLOTS = {
  SubagentStop: 'gate cho subagent (`tooling/gates.mjs --stage subagent`) — không có nó, output của agent con không bị kiểm gì',
  StopFailure: 'LỚP KINH TẾ (`observe.mjs`) — chỗ duy nhất vendor GỌI cho bạn khi tiền/quota chạm trần',
  InstructionsLoaded: 'thiết bị đo thuế context (`observe.mjs`) — thay cho việc ƯỚC LƯỢNG bằng grep',
  ConfigChange: 'lớp hai cho `protect-harness.mjs` — thấy cấu hình đổi giữa phiên bằng đường KHÁC Write|Edit',
  Setup: 'nghi thức dựng môi trường (`init.mjs` / `harness-doctor --quick`) — thay cho một dòng trong README mà người ta phải nhớ',
};
const emptySlots = Object.keys(NATIVE_SLOTS).filter(ev => !(settings.hooks ?? {})[ev]);
if (emptySlots.length) {
  // NÊU CÁCH SỬA, không chỉ nêu lỗ. Bản trước liệt kê đúng 5 slot trống ở cả ba repo tiêu thụ
  // và in đúng như vậy suốt nhiều version — nhưng không nói ai đóng được chúng, nên không ai
  // đóng. `settings.json` là SEED (upgrade không ghi đè), nên đường DUY NHẤT là migration 008.
  // Một dòng chẩn đoán không kèm lệnh sửa là một dòng sẽ được đọc rồi bỏ qua.
  advice.push(`${emptySlots.length}/5 điểm mở rộng native còn TRỐNG trong settings.json: `
    + emptySlots.map(e => `\n         · ${e} — ${NATIVE_SLOTS[e]}`).join('')
    + (mf ? '\n         Sửa: `node tooling/upgrade.mjs --from <template>` — migration 008 cắm chúng vào.'
          + ' `settings.json` là lớp SEED nên bước copy của upgrade KHÔNG chạm nó; chỉ migration đi qua được.'
          : ''));
}

// ── Sự kiện native ĐỔI CHỦ cơ chế, không phải chỗ cắm quan sát ───────────────
//
// `WorktreeCreate` và `WorktreeRemove` KHÔNG phải observer — chúng THAY THẾ cơ chế
// của vendor (verified: schema hook trong binary CLI 2.1.221):
//   WorktreeCreate  "Stdout should contain the absolute path to the created worktree"
//                   → hook không in path ⇒ CC THROW ⇒ `claude --worktree` vỡ cho cả đội
//   WorktreeRemove  "Exit code 0 — worktree removed successfully"
//                   → hook exit 0 ⇒ CC tin đã xoá và bỏ qua bước xoá của nó ⇒ RÒ RỈ worktree
//
// Một công cụ advisory cắm vào đó nổ theo cách im lặng nhất có thể. Check này bắt
// đúng ca đó và KHÔNG bắt provisioner thật: nó chỉ nhận diện các script advisory của
// chính harness này. Xem bài học tuần W32 "tái phân vai native" trong `.claude/learnings/`, §0.
const NOT_PROVISIONER = /(check-reservations|wt-clean|gates|observe|protect-|block-|dcg|session-start|post-edit-lint|harness-doctor|entropy-scan|harness-size)\b/;
for (const ev of ['WorktreeCreate', 'WorktreeRemove']) {
  for (const g of settings.hooks?.[ev] ?? []) {
    for (const h of g.hooks ?? []) {
      const cmd = String(h.command ?? '');
      if (NOT_PROVISIONER.test(cmd)) {
        advice.push(`\`${ev}\` đang cắm \`${cmd}\` — sự kiện này KHÔNG phải chỗ quan sát, nó ĐỔI CHỦ cơ chế `
          + (ev === 'WorktreeCreate'
            ? '(stdout PHẢI là đường dẫn worktree, không in ⇒ `claude --worktree` throw). '
            : '(exit 0 = "đã xoá xong" ⇒ CC bỏ qua bước xoá của nó ⇒ rò rỉ worktree). ')
          + 'Gỡ ra. Muốn nghi thức lúc mở worktree thì dùng `SessionStart`.');
      }
    }
  }
}

// ── Tổng kết ─────────────────────────────────────────────────────────────────
const failed = results.filter(r => r.status === 'fail');
console.log('\n╔══════════════════════════════════════════════════════════════╗');
if (blockers.length) {
  console.log('║  CHẶN — sửa trước mọi việc khác                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  for (const b of blockers) console.log(`  ✗  ${b}`);
}
if (failed.length) {
  console.log(`\n  Kiểm tra ĐỎ (${failed.length}) — chạy riêng để xem chi tiết:`);
  for (const f of failed) console.log(`     node ${f.cmd.join(' ')}`);
}
if (advice.length) {
  console.log(`\n  Nên làm (${advice.length}):`);
  for (const a of advice) console.log(`     · ${a}`);
}
if (!blockers.length && !failed.length && !advice.length) {
  console.log('║  Harness khoẻ.                                               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
}
console.log('');

// Cả cái bảng trên là stdout. Đo 2026-08-11: đọc doctor qua `| grep` nuốt mất exit 1
// và hai check ĐỎ, rồi "xanh" đó được viết vào PR. Dòng stderr dưới không lọc được.
// `code` — không phải `failed.length` — là sự thật ở đây: mục ĐỎ không chí tử CỐ Ý
// exit 0, và kêu ✗ ở đó là guard bắn nhầm.
const doctorCode = blockers.length || failed.some(f => f.critical) ? 1 : 0;
emitVerdict('HARNESS DOCTOR', { fail: blockers.length + failed.length, code: doctorCode });
process.exit(doctorCode);
