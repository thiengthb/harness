#!/usr/bin/env node
/**
 * Phỏng vấn một lần, ngay sau khi áp template — biến `harness.config.json` từ
 * placeholder thành cấu hình THẬT.
 *
 *   node tooling/setup.mjs                      PHÁT HIỆN + phỏng vấn, xem trước (không ghi)
 *   node tooling/setup.mjs --apply              ghi thật
 *   node tooling/setup.mjs --detect             chỉ in những gì ĐỌC ĐƯỢC từ repo, không hỏi
 *   node tooling/setup.mjs --answers a.json --apply    phi tương tác (agent · CI · test)
 *
 * ── VÌ SAO FILE NÀY TỒN TẠI
 *
 * README của template nói thẳng: *"Không có lệnh verify thì gate không tồn tại, và toàn bộ
 * harness này chỉ là trang trí."* Nhưng đường đi từ `apply-to` tới chỗ đó là **một dòng
 * nhắc** — `$EDITOR harness.config.json` — tức là nó xảy ra khi có người nhớ. Chính repo
 * template này in cảnh báo "chưa khai lệnh verify/test" ở MỌI phiên; nếu người viết harness
 * còn để nó rỗng thì người áp harness cũng vậy. Đây là thất bại số 1 của lớp này và nó là
 * thất bại của NGHI THỨC, không phải của cơ chế.
 *
 * ── LUẬT CỦA FILE NÀY, ĐỌC TRƯỚC KHI THÊM CÂU HỎI
 *
 * 1. **Mỗi câu hỏi phải ghi vào một field mà MÁY đọc, hoặc không hỏi câu đó.** Một bộ 20
 *    câu hỏi mà đầu ra là văn xuôi không ai kiểm là một nghi thức, và nghi thức không có
 *    gate thì chỉ tốn thời gian của người thật. Phần *không* biểu diễn được thành config
 *    (sản phẩm cho ai, gu UI, deploy đi đâu) đi vào ADR 0001 — và thứ được KIỂM là
 *    "có ADR 0001 hay không", không phải nội dung của nó.
 *
 * 2. **KHÔNG BAO GIỜ BỊA MỘT LỆNH.** Không đọc được thì để rỗng và NÓI RA. Một
 *    `commands.test` đoán sai làm gate đỏ ở chỗ không ai hiểu, và cách sửa nhanh nhất mà
 *    người đang gấp tìm ra là **xoá tên gate khỏi `gates`** — tức là đoán sai không tạo ra
 *    một gate sai, nó tạo ra MỘT GATE ÍT HƠN. Ba giá trị, không hai: thấy · không thấy · n/a.
 *
 * 3. **KHÔNG cài gì, KHÔNG chạy package manager.** Chọn stack là quyết định kiến trúc, và
 *    luật của repo này là agent ĐỀ XUẤT, người PROMOTE (xem `/harness-propose`). File này
 *    IN RA lệnh cần chạy; người bấm.
 *
 * 4. **Phát hiện phải mang BẰNG CHỨNG.** Mỗi giá trị đề xuất đi kèm chỗ nó được đọc ra
 *    (`package.json → scripts.build`). Không có bằng chứng thì nó là phỏng đoán đội lốt
 *    cấu hình, và đúng lớp lỗi mà `features/*.json → evidence` tồn tại để chặn.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { REPO_ROOT, repoPath, readJson, writeJson, report, exists, repoRole, commitAuthors, guardFlags } from './lib/harness.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
guardFlags(argv, { bool: ['--apply', '--detect', '--allow-empty-verify'], valued: ['--answers'] }, { name: 'setup.mjs' });

const APPLY = has('--apply');
const DETECT_ONLY = has('--detect');
const ANSWERS_FILE = arg('--answers');
const ALLOW_EMPTY_VERIFY = has('--allow-empty-verify');

const IS_TEMPLATE = repoRole() === 'template';
if (APPLY && IS_TEMPLATE) {
  console.error(`\n⛔ Đây là REPO TEMPLATE, không phải project đích.\n`
    + `  Ghi cấu hình thật vào đây sẽ biến placeholder của template thành cấu hình của MỘT project,\n`
    + `  và mọi project áp sau đó thừa hưởng nó. Chạy lệnh này TRONG project đã áp template.\n`
    + `  (Xem trước thì chạy được ở mọi đâu — bỏ --apply.)\n`);
  process.exit(1);
}

// ── PHÁT HIỆN ────────────────────────────────────────────────────────────────
// Mọi thứ dưới đây chỉ đọc file có thật trong repo. Không đoán theo tên project,
// không suy từ "project kiểu này thường dùng...".

const ev = [];                                   // bằng chứng: mỗi phát hiện một dòng
const unknown = [];                              // KHÔNG đọc được — khác rỗng, khác n/a
const found = (what, value, where) => { ev.push(`${what} = \`${value}\`  ← ${where}`); return value; };

const pkg = readJson(repoPath('package.json'));

/** `npm init` sinh sẵn một script `test` chỉ để fail. Nhận nó là nhận một gate đỏ vô nghĩa. */
const isPlaceholderScript = (body) => /no test specified|Error: no .* specified/i.test(String(body));

const NODE_RUNNERS = [
  ['pnpm-lock.yaml', (s) => `pnpm ${s}`, 'pnpm install --frozen-lockfile'],
  ['yarn.lock', (s) => `yarn ${s}`, 'yarn install --immutable'],
  ['bun.lockb', (s) => `bun run ${s}`, 'bun install --frozen-lockfile'],
  ['package-lock.json', (s) => `npm run ${s}`, 'npm ci'],
];

const SCRIPT_ALIASES = {
  typecheck: ['typecheck', 'type-check', 'tsc'],
  lint: ['lint'],
  lintFix: ['lint:fix', 'lint-fix'],
  test: ['test', 'test:unit'],
  build: ['build'],
  gen: ['gen', 'codegen', 'generate'],
  e2e: ['e2e', 'test:e2e'],
  a11y: ['a11y'],
  perf: ['perf', 'lighthouse'],
  depcruise: ['depcruise', 'dep:check'],
  verify: ['verify', 'check', 'ci'],
};

function detectNode() {
  if (!pkg) return null;
  const scripts = pkg.scripts ?? {};
  const hit = NODE_RUNNERS.find(([lock]) => exists(repoPath(lock)));
  const [lockName, wrap, install] = hit ?? ['(không có lockfile)', (s) => `npm run ${s}`, 'npm install'];
  if (!hit) unknown.push('không có lockfile — không chắc package manager nào. Đề xuất dùng npm; sửa `commands.install` nếu sai');
  const cmds = { install: found('commands.install', install, lockName) };
  for (const [field, names] of Object.entries(SCRIPT_ALIASES)) {
    const name = names.find(n => scripts[n] && !isPlaceholderScript(scripts[n]));
    if (name) cmds[field] = found(`commands.${field}`, wrap(name), `package.json → scripts.${name}`);
    else if (names.some(n => scripts[n])) unknown.push(`package.json → scripts.${names.find(n => scripts[n])} là placeholder của \`npm init\` (chỉ để fail) — BỎ QUA, khai tay nếu bạn có lệnh thật`);
  }
  return { stack: 'node', lintable: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs'], cmds };
}

function detectOther() {
  // Thứ tự KHÔNG quan trọng: mỗi nhánh đòi một file chỉ dấu riêng, không chồng nhau.
  if (exists(repoPath('pyproject.toml'))) {
    const t = readFileSync(repoPath('pyproject.toml'), 'utf8');
    const cmds = {};
    if (exists(repoPath('poetry.lock'))) cmds.install = found('commands.install', 'poetry install --sync', 'poetry.lock');
    else if (exists(repoPath('uv.lock'))) cmds.install = found('commands.install', 'uv sync --frozen', 'uv.lock');
    else if (exists(repoPath('requirements.txt'))) cmds.install = found('commands.install', 'pip install -r requirements.txt', 'requirements.txt');
    else unknown.push('pyproject.toml nhưng không thấy lockfile (poetry/uv/requirements) — khai `commands.install` tay');
    if (/\[tool\.ruff/.test(t)) { cmds.lint = found('commands.lint', 'ruff check .', 'pyproject.toml → [tool.ruff]'); cmds.lintFix = found('commands.lintFix', 'ruff check --fix .', 'pyproject.toml → [tool.ruff]'); }
    if (/\[tool\.mypy/.test(t) || /\bmypy\b/.test(t)) cmds.typecheck = found('commands.typecheck', 'mypy .', 'pyproject.toml → mypy');
    if (/\[tool\.pytest/.test(t) || /\bpytest\b/.test(t)) cmds.test = found('commands.test', 'pytest -q', 'pyproject.toml → pytest');
    return { stack: 'python', lintable: ['**/*.py'], cmds };
  }
  if (exists(repoPath('go.mod'))) {
    return { stack: 'go', lintable: ['**/*.go'], cmds: {
      install: found('commands.install', 'go mod download', 'go.mod'),
      typecheck: found('commands.typecheck', 'go vet ./...', 'go.mod'),
      test: found('commands.test', 'go test ./...', 'go.mod'),
      build: found('commands.build', 'go build ./...', 'go.mod'),
    } };
  }
  if (exists(repoPath('Cargo.toml'))) {
    return { stack: 'rust', lintable: ['**/*.rs'], cmds: {
      typecheck: found('commands.typecheck', 'cargo check --all-targets', 'Cargo.toml'),
      lint: found('commands.lint', 'cargo clippy --all-targets -- -D warnings', 'Cargo.toml'),
      test: found('commands.test', 'cargo test', 'Cargo.toml'),
      build: found('commands.build', 'cargo build --release', 'Cargo.toml'),
    } };
  }
  return null;
}

const MIGRATION_DIRS = ['prisma/migrations', 'drizzle', 'supabase/migrations', 'alembic/versions', 'db/migrate', 'migrations'];
const GENERATED_DIRS = ['src/__generated__', 'src/gql', 'src/graphql/generated', 'prisma/generated'];

const PLATFORM_SIGNS = [
  ['web', ['next.config.js', 'next.config.mjs', 'next.config.ts', 'vite.config.ts', 'vite.config.js', 'nuxt.config.ts', 'index.html', 'svelte.config.js']],
  ['ios', ['ios', 'Podfile']],
  ['android', ['android', 'build.gradle', 'build.gradle.kts']],
  ['desktop', ['tauri.conf.json', 'src-tauri', 'electron.vite.config.ts', 'electron-builder.yml']],
  // `Dockerfile` KHÔNG ở đây: một app web đóng gói bằng Docker vẫn là web, không phải một
  // platform `api`. Nó là tín hiệu DEPLOY, và nó ở đúng chỗ đó bên dưới.
  ['api', ['server', 'api', 'main.go', 'manage.py']],
];
const DEPLOY_SIGNS = [
  ['docker', ['Dockerfile', 'docker-compose.yml', 'compose.yaml']],
  ['vercel', ['vercel.json', '.vercel']],
  ['fly.io', ['fly.toml']],
  ['kubernetes', ['k8s', 'kustomization.yaml', 'helm']],
];

/**
 * `.github/workflows/` KHÔNG phải tín hiệu deploy — chính harness ship `ci.yml` và
 * `harness-parity.yml` vào đó, nên "có GitHub Actions" đúng ở MỌI project ngay sau
 * `apply-to`. Một phát hiện luôn đúng không mang thông tin nào; nó chỉ làm bảng phát hiện
 * dài ra và dạy người đọc bỏ qua bảng đó. Chỉ workflow KHÔNG PHẢI của harness mới tính.
 */
const HARNESS_WORKFLOWS = new Set(['ci.yml', 'harness-parity.yml']);
function detectDeployWorkflows() {
  const dir = repoPath('.github', 'workflows');
  if (!exists(dir)) return [];
  const others = readdirSync(dir).filter(f => /\.ya?ml$/.test(f) && !HARNESS_WORKFLOWS.has(f));
  return others.length ? [`github-actions (${others.join(', ')})`] : [];
}

/**
 * BAO NHIÊU NGƯỜI — câu hỏi quyết định phân nửa lớp phối hợp có nghĩa hay không.
 *
 * Đây là CẬN TRÊN đo từ lịch sử git, không phải số người. `commitAuthors()` ghi rõ vì sao
 * (một người hai email đếm ra hai). Nên nó đi vào `ev` như một bằng chứng để NGƯỜI đọc và
 * sửa, không đi vào config như một kết luận.
 */
function detectTeam() {
  const authors = commitAuthors();
  if (!authors) {
    unknown.push('không đọc được lịch sử git (repo chưa có commit nào?) — không đo được số người, phải trả lời tay');
    return null;
  }
  ev.push(`project.teamSize ≤ ${authors.length}  ← ${authors.length} email tác giả distinct trong 500 commit gần nhất`
    + ` (${authors.join(' · ')}) — CẬN TRÊN: một người dùng hai email đếm ra hai`);
  return authors;
}

function detectAll() {
  const stack = detectNode() ?? detectOther();
  if (!stack) unknown.push('không nhận ra stack (không có package.json / pyproject.toml / go.mod / Cargo.toml) — mọi `commands` phải khai tay');

  const migrations = MIGRATION_DIRS.filter(d => exists(repoPath(...d.split('/'))));
  if (migrations.length) ev.push(`paths.migrations = ${JSON.stringify(migrations.map(d => `${d}/**`))}  ← thư mục có thật`);
  else unknown.push('không thấy thư mục migration nào — `paths.migrations` sẽ để rỗng, và guard `protect-migrations` sẽ không có gì để gác');

  const generated = GENERATED_DIRS.filter(d => exists(repoPath(...d.split('/'))));
  const platforms = ['core', ...PLATFORM_SIGNS.filter(([, signs]) => signs.some(s => exists(repoPath(...s.split('/'))))).map(([p]) => p)];
  ev.push(`project.platforms = ${JSON.stringify(platforms)}  ← file/thư mục chỉ dấu`);
  const deploy = [...DEPLOY_SIGNS.filter(([, signs]) => signs.some(s => exists(repoPath(...s.split('/'))))).map(([d]) => d),
                  ...detectDeployWorkflows()];
  if (deploy.length) ev.push(`deploy (ghi vào ADR, không vào config) = ${deploy.join(' · ')}  ← file chỉ dấu`);
  else unknown.push('không thấy dấu vết deploy nào (Dockerfile/vercel.json/fly.toml/k8s) — mục Deploy của ADR 0001 phải viết tay');

  return { stack, migrations, generated, platforms, deploy, authors: detectTeam() };
}

const d = detectAll();

// ── `verify` — gate quan trọng nhất, và nó là gate GHÉP ──────────────────────
// Không repo nào có sẵn một script tên `verify` đúng nghĩa "mọi thứ phải xanh trước khi
// merge". Nếu không tự đề xuất, field này ở lại rỗng — và đó chính là trạng thái mà cả
// README lẫn SessionStart hook gọi là "việc số 1".
function proposeVerify(cmds) {
  if (cmds.verify) return cmds.verify;
  const parts = ['typecheck', 'lint', 'test', 'build'].filter(k => cmds[k]).map(k => cmds[k]);
  if (!parts.length) return '';
  const joined = parts.join(' && ');
  ev.push(`commands.verify = \`${joined}\`  ← GHÉP từ ${parts.length} lệnh đã phát hiện (không repo nào có sẵn script này)`);
  return joined;
}

if (d.stack) d.stack.cmds.verify = proposeVerify(d.stack.cmds);

if (DETECT_ONLY) {
  report('PHÁT HIỆN', { ok: ev, unknown });
  console.log('  Không ghi gì. Chạy `node tooling/setup.mjs` để phỏng vấn, thêm `--apply` để ghi.\n');
  process.exit(0);
}

// ── PHỎNG VẤN ────────────────────────────────────────────────────────────────
const cfgPath = repoPath('harness.config.json');
const cfg = readJson(cfgPath);
if (!cfg) { console.error(`Không đọc được ${cfgPath} — chạy apply-to trước.`); process.exit(1); }

const preset = ANSWERS_FILE ? readJson(ANSWERS_FILE) : null;
if (ANSWERS_FILE && !preset) { console.error(`Không đọc được ${ANSWERS_FILE}`); process.exit(1); }

const QUESTIONS = [
  { id: 'projectId', ask: 'Mã project (dùng trong log, pack, tên nhánh)', def: () => basename(REPO_ROOT) },
  // ĐẶT NGAY SAU `projectId`, TRƯỚC MỌI THỨ KHÁC — cố ý. Nửa lớp phối hợp của harness này
  // (đặt chỗ · dò PR người khác · CODEOWNERS · "hỏi người, đừng tự quyết") chỉ có nghĩa khi
  // có người thứ hai. Hỏi muộn thì người trả lời đã đọc xong một loạt câu hỏi giả định có đội.
  {
    id: 'teamSize',
    ask: 'BAO NHIÊU NGƯỜI làm project này (kể cả bạn)? `1` = solo ⇒ tắt lớp phối hợp liên-người '
      + '(đặt chỗ, dò PR của người khác) và nói rõ ở chỗ nó bị tắt. `2+` = giữ nguyên. '
      + 'Bỏ trống = CHƯA KHAI ⇒ giữ nguyên như có đội (khác `1`)',
    def: () => {
      const cur = cfg.project?.teamSize;
      if (Number.isInteger(cur) && cur > 0) return String(cur);
      // Cận trên đo được, KHÔNG phải câu trả lời. Không đề xuất `1` từ một repo mới toanh:
      // "chưa ai khác commit" và "sẽ không có ai khác" là hai chuyện khác nhau.
      return d.authors?.length ? String(d.authors.length) : '';
    },
  },
  { id: 'dri', ask: 'DRI — handle GitHub của người CHỊU TRÁCH NHIỆM lớp harness (không có DRI thì harness mục trong ~6 tuần)', def: () => cfg.project?.dri?.includes('CHANGEME') ? '' : cfg.project?.dri },
  { id: 'issuePrefix', ask: 'Tiền tố mã issue (ví dụ ABC → ABC-123), cách nhau bằng dấu phẩy', def: () => (cfg.project?.issuePrefixes ?? []).join(',') },
  { id: 'platforms', ask: `Platform trong scope (phát hiện: ${d.platforms.join(',')}) — cách nhau bằng dấu phẩy`, def: () => d.platforms.join(',') },
  { id: 'monthlyUsdCap', ask: 'Trần chi tiêu mỗi tháng (USD, số). 0 = KHÔNG có trần — đây là lớp duy nhất gây thiệt hại tài chính trực tiếp', def: () => String(cfg.budget?.monthlyUsdCap ?? 0) },
  { id: 'upstream', ask: 'Đường dẫn (hoặc URL git) tới repo template harness — để gửi bài học NGƯỢC LÊN. Bỏ trống nếu chưa có', def: () => cfg.knowledge?.upstream ?? '' },
  // Ba câu dưới KHÔNG vào config: không field nào kiểm được chúng. Chúng vào ADR 0001,
  // nơi một quyết định có ngày, có người, và có điều kiện xem lại.
  { id: 'adrProduct', ask: '[ADR] Sản phẩm này làm gì, cho ai — 1–2 câu', def: () => '' },
  { id: 'adrDesign', ask: '[ADR] Nguồn sự thật của thiết kế: Figma? design system nào? token ở đâu?', def: () => '' },
  { id: 'adrDeploy', ask: `[ADR] Deploy đi đâu, ai bấm nút production${d.deploy.length ? ` (phát hiện: ${d.deploy.join(' · ')})` : ''}`, def: () => d.deploy.join(' · ') },
  { id: 'adrDb', ask: '[ADR] Database + cách chạy migration (công cụ nào, ai apply lên staging)', def: () => '' },
];

const answers = {};
if (preset) {
  for (const q of QUESTIONS) answers[q.id] = preset[q.id] ?? q.def() ?? '';
} else if (!process.stdin.isTTY) {
  console.error(`\n⛔ Không có terminal để hỏi, và không có --answers.\n`
    + `  Phiên phi tương tác phải truyền câu trả lời: node tooling/setup.mjs --answers a.json --apply\n`
    + `  Xem khoá cần điền: node tooling/setup.mjs --detect\n`);
  process.exit(1);
} else {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log('\n=== PHỎNG VẤN — Enter để lấy giá trị trong [] ===\n');
  for (const q of QUESTIONS) {
    const def = q.def() ?? '';
    const a = (await rl.question(`  ${q.ask}\n    ${def ? `[${def}] ` : ''}> `)).trim();
    answers[q.id] = a || def;
  }
  // Lệnh nào phát hiện không ra thì HỎI — mỗi lệnh rỗng là một gate không tồn tại.
  const cmds = d.stack?.cmds ?? {};
  for (const key of Object.keys(cfg.commands ?? {}).filter(k => !k.startsWith('$'))) {
    if (cmds[key]) continue;
    const a = (await rl.question(`  commands.${key} — KHÔNG phát hiện được. Bỏ trống = gate này KHÔNG TỒN TẠI\n    > `)).trim();
    if (a) cmds[key] = a;
  }
  if (d.stack) d.stack.cmds = cmds;
  rl.close();
}

// ── DỰNG CẤU HÌNH MỚI ────────────────────────────────────────────────────────
const next = structuredClone(cfg);
next.project.id = answers.projectId;

// BA GIÁ TRỊ. Bỏ trống ⇒ KHÔNG ghi field ⇒ `teamSize()` trả `null` ⇒ `isSolo()` false ⇒ giữ
// nguyên lớp phối hợp. Ghi `0` hay ghi `null` vào config đều SAI theo hai kiểu khác nhau:
// `0` là một con số hợp lệ mà không có nghĩa, `null` là một khoá tồn tại nói "tôi không biết"
// — và khoá tồn tại thì lần chạy `setup` sau sẽ coi nó là câu trả lời đã có.
const teamSizeAnswer = Number.parseInt(String(answers.teamSize).trim(), 10);
if (Number.isInteger(teamSizeAnswer) && teamSizeAnswer > 0) next.project.teamSize = teamSizeAnswer;
else delete next.project.teamSize;

next.project.dri = answers.dri || next.project.dri;
next.project.issuePrefixes = answers.issuePrefix.split(',').map(s => s.trim()).filter(Boolean);
next.project.platforms = answers.platforms.split(',').map(s => s.trim()).filter(Boolean);

// CHỈ ĐIỀN CHỖ TRỐNG. Lệnh đã có trong config là lệnh NGƯỜI đã khai — có thể kèm cờ, cờ
// môi trường, hoặc một wrapper mà không phép phát hiện nào đoán ra được. Ghi đè nó là lấy
// một giá trị ĐÚNG thay bằng một giá trị SUY RA.
//
// Ca này không hiếm mà là ca THƯỜNG: cả ba repo tiêu thụ hiện có đều đã khai tay 8–9 lệnh
// trước khi `setup.mjs` tồn tại. Một công cụ chỉ an toàn với repo trống là công cụ không
// dùng được ở đúng nơi cần nó.
const overwritten = [];
for (const [k, v] of Object.entries(d.stack?.cmds ?? {})) {
  if (!(k in next.commands)) continue;
  const cur = String(next.commands[k] ?? '').trim();
  if (!cur) { next.commands[k] = v; continue; }
  if (cur !== v) overwritten.push(`commands.${k}: GIỮ \`${cur}\` (phát hiện ra \`${v}\` — không ghi đè)`);
}
if (d.migrations.length) next.paths.migrations = d.migrations.map(x => `${x}/**`);
else next.paths.migrations = [];
if (d.stack?.lintable) next.paths.lintable = d.stack.lintable;
for (const g of d.generated.map(x => `${x}/**`)) if (!next.paths.generated.includes(g)) next.paths.generated.push(g);

// `paths.hot` và `publicSurface` mặc định của template là PHỎNG ĐOÁN của một monorepo TS
// (`packages/contracts/**`, `**/index.ts`). Ở một repo Python/Go chúng khớp KHÔNG GÌ CẢ —
// tức là guard vùng nóng và gate breaking-change tồn tại mà không gác gì, im lặng.
// Không đoán thay: xoá và NÓI RA cách đo (`coactivity.mjs` đọc lịch sử git — số thật).
const guessedHot = ['packages/contracts/**', '**/index.ts', '**/routes.*', '**/i18n/**', 'package.json'];
const hotIsUntouchedGuess = JSON.stringify(next.paths.hot) === JSON.stringify(guessedHot);
if (hotIsUntouchedGuess && d.stack?.stack !== 'node') next.paths.hot = [];
const publicIsUntouchedGuess = JSON.stringify(next.paths.publicSurface) === JSON.stringify(['packages/contracts/**', 'packages/core/**', 'packages/ports/**']);
if (publicIsUntouchedGuess && d.stack?.stack !== 'node') next.paths.publicSurface = [];

// Ngưỡng PR: mặc định của template là ngưỡng của REPO TEMPLATE (1500 dòng) và có lý do đo
// được — mọi thay đổi harness là đa file bắt buộc. Repo sản phẩm không có ràng buộc đó.
if ((next.limits?.prFailLines ?? 0) >= 1500) { next.limits.prWarnLines = 400; next.limits.prFailLines = 800; }
next.budget.monthlyUsdCap = Number(answers.monthlyUsdCap) || 0;
next.knowledge.packName = `${answers.projectId}-harness-pack`;
next.knowledge.upstream = answers.upstream;

// ── ADR 0001 ────────────────────────────────────────────────────────────────
const adrRel = join('docs', 'adr', `0001-${answers.projectId}-stack-va-quy-trinh.md`);
const today = new Date().toISOString().slice(0, 10);
const reviewDate = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
const adr = `# ADR 0001 — Stack và quy trình của ${answers.projectId}

- **Trạng thái**: Accepted
- **Ngày**: ${today}
- **Deciders**: ${answers.dri || '@CHƯA-CÓ-DRI'}
- **last-verified**: ${today}

## Context

${answers.adrProduct || '_CHƯA ĐIỀN — sản phẩm này làm gì, cho ai._'}

## Decision

### Stack
Phát hiện từ chính repo (không phải khai báo, không phải phỏng đoán):

${ev.length ? ev.map(e => `- ${e}`).join('\n') : '- _không phát hiện được gì_'}

### Thiết kế
${answers.adrDesign || '_CHƯA ĐIỀN — nguồn sự thật của thiết kế._'}

### Deploy
${answers.adrDeploy || '_CHƯA ĐIỀN._'}

> Agent chỉ được apply/deploy lên **staging**. **Người bấm nút production.**
> Xem \`.claude/rules/danger-zones.md §1\`.

### Database & migration
${answers.adrDb || '_CHƯA ĐIỀN._'}

> Migration **đã merge** là lịch sử chung của database — không sửa, viết migration MỚI.

## Consequences

**Được:** \`harness.config.json\` khai đúng stack này, nên gate chạy thật thay vì bị bỏ qua
im lặng. Kiểm bất cứ lúc nào: \`node tooling/gates.mjs --list --timing\`.

**Mất:** mỗi lệnh trong \`commands\` là một phụ thuộc vào cách repo này được build hôm nay.
Đổi build tool thì phải sửa ở đây — một chỗ, không phải 20 hook.

## Điều kiện xem lại

Xem lại trước **${reviewDate}** (90 ngày), hoặc ngay khi: đổi package manager · đổi framework
· thêm platform · lệnh nào trong \`commands\` bắt đầu fail vì lý do không liên quan tới code.
`;

// ── XEM TRƯỚC hoặc GHI ───────────────────────────────────────────────────────
const changed = [];
const walk = (a, b, path = '') => {
  for (const k of Object.keys(b)) {
    if (k.startsWith('$')) continue;
    const va = a?.[k], vb = b[k];
    if (vb && typeof vb === 'object' && !Array.isArray(vb)) { walk(va, vb, `${path}${k}.`); continue; }
    if (JSON.stringify(va) !== JSON.stringify(vb)) changed.push(`${path}${k}: ${JSON.stringify(va)} → ${JSON.stringify(vb)}`);
  }
};
walk(cfg, next);

const emptyCmds = Object.entries(next.commands).filter(([k, v]) => !k.startsWith('$') && !String(v).trim()).map(([k]) => k);
const gatesAffected = Object.entries(next.gates ?? {})
  .filter(([k]) => !k.startsWith('$'))
  .map(([stage, names]) => [stage, (names ?? []).filter(n => emptyCmds.includes(n))])
  .filter(([, miss]) => miss.length);

const ok = changed.length ? changed : ['không có gì đổi'];
const warn = [...overwritten];
for (const [stage, miss] of gatesAffected) {
  warn.push(`gates.${stage}: ${miss.join(', ')} KHÔNG có lệnh → ${miss.length} gate trong stage này không tồn tại`);
}
if (!String(next.commands.verify).trim()) {
  warn.push('commands.verify RỖNG — đây là việc số 1. Không có nó thì `/pre-merge` và job `verify` của CI không kiểm gì cả.');
}

// HỆ QUẢ của câu trả lời `teamSize` phải HIỆN RA ngay ở màn xem trước. Một field ghi vào
// config mà không nói nó tắt cái gì thì người ta phát hiện ra bằng cách thấy guard biến mất.
if (next.project.teamSize === 1) {
  ok.push('SOLO (teamSize = 1) → TẮT 3 thứ: guard đặt chỗ ở pre-commit (`check-reservations`) · '
    + 'dò reservation của người khác (`overlap-scan` ②) · lời khuyên "hỏi người" khi có chồng lấn. '
    + 'GIỮ: mọi guard an toàn (secret · migration · lịch sử chung · vùng cấm harness), nghi thức '
    + '/claim và nhật ký `docs/progress/` (người đọc là phiên sau và máy khác của BẠN), và dò chồng '
    + 'lấn giữa các NHÁNH của chính bạn — hai phiên song song vẫn giẫm chân nhau được.');
} else if (!next.project.teamSize) {
  unknown.push('`project.teamSize` CHƯA KHAI ⇒ harness giữ nguyên toàn bộ lớp phối hợp liên-người. '
    + 'Đó là mặc định an toàn, không phải "đã đo là có đội". Chạy lại `setup.mjs` để trả lời.');
}

if (!APPLY) {
  report('SETUP · XEM TRƯỚC', { ok, warn, unknown });
  console.log(`  ADR sẽ được ghi ra: ${adrRel}\n`);
  console.log('  Thêm --apply để ghi.\n');
  process.exit(0);
}

if (!String(next.commands.verify).trim() && !ALLOW_EMPTY_VERIFY) {
  report('SETUP', { ok, warn, unknown });
  console.error(`\n⛔ DỪNG: \`commands.verify\` vẫn rỗng.\n`
    + `  Đây không phải sự cẩn thận quá mức — đó là điều kiện để mọi thứ khác trong harness này\n`
    + `  có nghĩa. Không có nó, gate xanh vì không có gì chạy, và BẠN vẫn là verification loop.\n`
    + `  Ghép từ lệnh bạn đã có là đủ để bắt đầu: "<typecheck> && <test>".\n`
    + `  Thật sự chưa có gì để chạy → --allow-empty-verify (và nó sẽ nằm trong manifest).\n`);
  process.exit(2);
}

writeJson(cfgPath, next);

const adrPath = repoPath(adrRel);
mkdirSync(join(adrPath, '..'), { recursive: true });
if (existsSync(adrPath)) {
  writeFileSync(adrPath + '.new', adr, 'utf8');
  warn.push(`${adrRel} đã tồn tại — bản mới ghi ra ${adrRel}.new, tự merge`);
} else writeFileSync(adrPath, adr, 'utf8');

// Ghi PROFILE vào manifest: đây là chỗ `harness-doctor` biết setup đã chạy hay chưa, và
// chỗ `upgrade` sau này đọc được "project này là stack gì" mà không phải đoán lại.
const mfPath = repoPath('.claude', 'harness-manifest.json');
const mf = readJson(mfPath, {});
mf.profile = {
  ranAt: new Date().toISOString(),
  stack: d.stack?.stack ?? 'unknown',
  platforms: next.project.platforms,
  deploy: d.deploy,
  detected: ev,
  unknown,
  allowedEmptyVerify: !String(next.commands.verify).trim(),
};
mkdirSync(join(mfPath, '..'), { recursive: true });
writeJson(mfPath, mf);

report('SETUP', { ok, warn, unknown });
console.log(`  Đã ghi: harness.config.json · ${adrRel} · .claude/harness-manifest.json → profile

  Bước tiếp theo — theo thứ tự:

    1. node tooling/init.mjs                       bootstrap (git config, hooks path)
    2. node tooling/gates.mjs --list --timing      gate nào ĐANG THẬT SỰ chạy + độ trễ
    3. node tooling/harness-doctor.mjs             kiểm sức khoẻ toàn bộ
    4. $EDITOR AGENTS.md                           3 mục: Project · Lệnh · Gotchas
    5. $EDITOR .github/CODEOWNERS                  handle thật
    6. node tooling/coactivity.mjs                 ĐO vùng nóng rồi điền paths.hot

  Script này KHÔNG cài gì cả — cố ý. Cần cài dependency thì chạy: ${next.commands.install || '(chưa khai commands.install)'}
`);
