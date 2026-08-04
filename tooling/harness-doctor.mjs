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
import { repoPath, run, config, readJson, git, exists } from './lib/harness.mjs';

const QUICK = process.argv.includes('--quick');
const cfg = config();

const checks = [
  { id: 'hooks',    label: 'Hook tests',              cmd: ['tooling/test-hooks.mjs'],        critical: true },
  // Migration là code DUY NHẤT ghi vào repo người khác ⇒ critical, ngang hàng hook tests.
  { id: 'migs',     label: 'Migration tests',         cmd: ['tooling/test-migrations.mjs'],   critical: true },
  { id: 'coverage', label: 'Template coverage',       cmd: ['tooling/apply-to.mjs', '--audit'], critical: false },
  { id: 'know',     label: 'Knowledge lint',          cmd: ['tooling/knowledge/lint.mjs'],    critical: false },
  { id: 'entropy',  label: 'Entropy scan',            cmd: ['tooling/entropy-scan.mjs'],      critical: false },
  { id: 'size',     label: 'Kích thước harness',      cmd: ['tooling/harness-size.mjs'],      critical: false },
  { id: 'feature',  label: 'Feature integrity',       cmd: ['tooling/check-feature-integrity.mjs'], critical: false, slow: true },
  { id: 'evals',    label: 'Eval (liệt kê)',          cmd: ['evals/run.mjs', '--dry'],        critical: false },
];

const results = [];
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  HARNESS DOCTOR                                              ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

for (const c of checks) {
  if (QUICK && c.slow) { results.push({ ...c, status: 'skip' }); continue; }
  if (!exists(repoPath(c.cmd[0]))) { results.push({ ...c, status: 'missing' }); continue; }
  const r = run('node', [repoPath(c.cmd[0]), ...c.cmd.slice(1)]);
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
const IS_TEMPLATE = exists(repoPath('HARNESS-CHANGELOG.md'))
  && exists(repoPath('tooling', 'apply-to.mjs'))
  && !exists(repoPath('.claude', 'harness-manifest.json'));
const blocker = m => (IS_TEMPLATE ? advice : blockers).push(m);

if (IS_TEMPLATE) console.log('  ℹ  Đây là REPO TEMPLATE — placeholder CHANGEME là đúng, không phải lỗi.');

if (String(cfg.project?.id).includes('CHANGEME')) blocker('harness.config.json → project.id vẫn là CHANGEME');
if (String(cfg.project?.dri || '').includes('CHANGEME')) blocker('harness.config.json → project.dri chưa điền');

const cmds = Object.entries(cfg.commands || {}).filter(([, v]) => v && String(v).trim());
if (!cmds.length) {
  blocker('commands rỗng — GATE KHÔNG TỒN TẠI. Harness này đang chỉ là trang trí, và BẠN là verification loop.');
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

if (!cfg.budget?.monthlyUsdCap) advice.push('budget.monthlyUsdCap = 0 — không có cap chi tiêu. Xem docs/ECONOMICS.md');

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

// ── Vòng học có đang chạy không ──────────────────────────────────────────────
console.log('\n── VÒNG HỌC ──');
const fixlogPath = repoPath('.claude', 'telemetry', 'manual-fixes.log');
const fixCount = exists(fixlogPath) ? readFileSync(fixlogPath, 'utf8').split('\n').filter(Boolean).length : 0;
const lessonCount = readJson(repoPath('knowledge', 'index.json'), { count: 0 }).count;
const evalCount = exists(repoPath('evals', 'tasks'))
  ? (await import('node:fs')).readdirSync(repoPath('evals', 'tasks')).filter(f => f.endsWith('.md') && !f.startsWith('_')).length : 0;

const incDir = repoPath("knowledge", "incoming");
const pending = exists(incDir)
  ? (await import("node:fs")).readdirSync(incDir).filter(d => exists(repoPath("knowledge","incoming",d,"lessons"))).length : 0;

console.log(`  fixlog: ${fixCount} mục  ·  bài học: ${lessonCount}  ·  eval task: ${evalCount}  ·  pack chờ duyệt: ${pending}`);
if (pending) advice.push(`${pending} pack chờ duyệt ở knowledge/incoming/ — quyết đi: node tooling/knowledge/accept.mjs --list`);

if (fixCount === 0) advice.push('fixlog trống — vòng học chưa có nguyên liệu. Đây là việc RẺ NHẤT và GIÁ TRỊ NHẤT: `node tooling/fixlog.mjs "..."` mỗi lần bạn phải sửa tay (3 giây)');
if (evalCount === 0) advice.push('không có eval task — bạn đang TỐI ƯU MÙ: không có cách nào biết một thay đổi harness làm tốt lên hay tệ đi');
if (fixCount >= 10 && lessonCount === 0) advice.push(`${fixCount} lần sửa tay nhưng 0 bài học — chạy /harness-retro`);

// ── Manifest / version ───────────────────────────────────────────────────────
const mf = readJson(repoPath('.claude', 'harness-manifest.json'));
const localVer = exists(repoPath('harness.version')) ? readFileSync(repoPath('harness.version'), 'utf8').trim() : null;
if (mf) console.log(`  harness version: ${mf.templateVersion} (áp ${String(mf.upgradedAt || mf.appliedAt).slice(0, 10)})`);
else if (localVer) console.log(`  harness version: ${localVer} (chưa có manifest — nâng cấp lần tới sẽ không phát hiện được file bạn đã sửa)`);
else advice.push('không có .claude/harness-manifest.json — chạy upgrade.mjs một lần để tạo, nếu không nâng cấp sau này sẽ ghi đè mù');

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
    for (const k of keys) if (!KNOWN_SKILL_KEYS.has(k)) unknownKeys.push(`skill/${name}: ${k}`);
  }
}
const skillCap = cfg.limits?.maxSkills ?? 12;
console.log(`  skill: ${skillTotal} tổng · ${discoverable} model tự gọi được (trần ${skillCap})`);
if (discoverable > skillCap) advice.push(`${discoverable} skill trong tầng discovery (trần ${skillCap}) — mỗi cái trả tiền thuê \`description\` MỌI phiên. Thêm \`disable-model-invocation: true\` cho skill nghi thức: chi phí context về 0, không mất chức năng`);
for (const g of grantsWrite) advice.push(`skill \`${g}\`: thân nói KHÔNG ra thay đổi nhưng \`allowed-tools\` tiền-duyệt Write/Edit. Trường HẠN CHẾ là \`disallowed-tools\` — đây là template, nó DẠY thói quen cho mọi repo nhận nó`);

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
for (const u of unknownKeys) advice.push(`frontmatter key lạ — ${u} (allowlist cập nhật 2026-08-04; nếu vendor vừa thêm field này thì cập nhật allowlist trong doctor, đừng bỏ qua check)`);

// ── Danh mục công cụ: SINH, không gõ tay ─────────────────────────────────────
//
// Mọi thứ máy biết được thì sinh ra. Một bảng hook viết tay trong README lệch
// khỏi thực tế mà không ai thấy — và hai trong ba dòng thiếu thường là loại
// CHẶN được lệnh ghi file.
console.log('\n── DANH MỤC HOOK ──');
const settings = readJson(repoPath('.claude', 'settings.json'), {});
const wired = new Map();                                  // file → [event…]
for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
  for (const g of groups ?? []) for (const h of g.hooks ?? []) {
    const m = String(h.command ?? '').match(/hooks[\/\\]([\w.-]+\.mjs)/);
    if (m) wired.set(m[1], [...(wired.get(m[1]) ?? []), event]);
  }
}
// Bằng chứng hook ĐÃ CHẠY. Ba tình huống sau đọc GIỐNG HỆT NHAU nếu không đếm:
// hook chạy suốt tuần không bắt gì (TỐT) · hook không được cắm (mã chết) · hook crash
// im lặng (hỏng). `hookRan()` ghi nhánh cho-qua; `gate-fails` ghi nhánh chặn.
// KHÔNG có dữ liệu là `?` (CHƯA ĐO ĐƯỢC), KHÔNG phải `0` — gộp hai cái đó là cách một
// cái gác đang làm việc bị đề xuất xoá.
const tally = (file, field = 2) => {
  const m = new Map();
  if (!exists(repoPath('.claude', 'telemetry', file))) return m;
  for (const line of readFileSync(repoPath('.claude', 'telemetry', file), 'utf8').split('\n')) {
    const p = line.split('|');
    if (p.length < field + 2) continue;
    const key = p[field], sub = p[field + 1];
    const e = m.get(key) ?? {};
    e[sub] = (e[sub] ?? 0) + 1;
    m.set(key, e);
  }
  return m;
};
const hookRuns = tally('hook-runs.log');
const hookBlocks = tally('gate-fails.log');

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
  // `fired` của một hook KHÔNG có đường exit 2 là `n/a`, không phải `0`.
  // Gộp hai giá trị đó là cách một bảng nói "cái gác này vô dụng" về một cái gác đang làm việc.
  const runCol = passes || blocks ? `${passes} qua · ${canBlock ? `${blocks} chặn` : 'n/a chặn'}` : '? chưa đo';
  console.log(`  ${events ? '✓' : '✗'} ${f.padEnd(28)} ${(events ? events.join(',') : 'KHÔNG CẮM').padEnd(22)} ${(canBlock ? 'chặn được' : 'chỉ nhắc (n/a)').padEnd(15)} ${runCol}`);
  if (!events) advice.push(`hook \`${f}\` có trên đĩa nhưng KHÔNG có trong settings.json — mã chết trông như đang sống`);
  // "CHƯA ĐO ĐƯỢC" ≠ "0 lần". Chỉ nói khi log đã có dữ liệu của hook KHÁC: lúc đó
  // sự im lặng của hook này mới là một câu hỏi, không phải một hệ quả của việc chưa chạy gì.
  else if (!passes && !blocks && hookRuns.size) {
    advice.push(`hook \`${f}\` đã cắm nhưng KHÔNG có dòng nào trong hook-runs.log/gate-fails.log trong khi hook khác có — chưa có BẰNG CHỨNG nó chạy (có thể chỉ là chưa gặp ca của nó, cũng có thể là crash im lặng: chạy \`node tooling/test-hooks.mjs\`)`);
  }
}
if (!carriesHooks && onDisk.length) advice.push('apply-to.mjs không mang `.claude/hooks/` — repo tiêu thụ sẽ nhận settings.json trỏ vào file không tồn tại');

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
const HISTORICAL = /^(HARNESS-CHANGELOG\.md|\.claude\/whats-new\.md|docs\/adr\/|\.claude\/learnings\/)/;
const deadRefs = new Map();
for (const f of git(['ls-files']).stdout.split('\n').filter(Boolean)) {
  if (!/\.(md|mjs)$/.test(f) || HISTORICAL.test(f)) continue;
  let txt = ''; try { txt = readFileSync(repoPath(f), 'utf8'); } catch { continue; }
  for (const m of txt.matchAll(/`\/([a-z][a-z0-9-]*)`/g)) {
    const n = m[1];
    if (skillNames.has(n) || NATIVE_OR_NOT_A_SKILL.has(n)) continue;
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
for (const d of WANT_DENY) if (!deny.includes(d)) advice.push(`thiếu deny rule \`${d}\` — hook tương ứng chỉ khớp Write|Edit, deny rule phủ thêm \`sed -i\`/\`cat >\` trong Bash và hợp nhất vào ranh giới sandbox`);
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
  advice.push(`${emptySlots.length}/5 điểm mở rộng native còn TRỐNG trong settings.json: `
    + emptySlots.map(e => `\n         · ${e} — ${NATIVE_SLOTS[e]}`).join(''));
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
// chính harness này. Xem `.claude/learnings/2026-W32-tai-phan-vai-native.md` §0.
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

process.exit(blockers.length || failed.some(f => f.critical) ? 1 : 0);
