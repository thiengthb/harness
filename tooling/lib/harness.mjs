/**
 * Thư viện dùng chung cho MỌI hook và script trong harness này.
 *
 * Ba luật bất di bất dịch (Parity Contract — xem AGENTS.md §Đa hệ điều hành):
 *   1. os.homedir()  — không bao giờ $HOME / %USERPROFILE%
 *   2. os.tmpdir()   — không bao giờ /tmp / %TEMP%
 *   3. path.join()   — không bao giờ nối chuỗi bằng '/' hay '\\'
 *
 * Không import package ngoài. File này phải chạy được với `node` trần
 * trên Ubuntu / macOS / Windows, kể cả trước khi `install` chạy.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative, resolve, sep, dirname } from 'node:path';
import { tmpdir, platform, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const IS_WIN = platform() === 'win32';

/** Gốc repo = thư mục cha của tooling/lib/ */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ─────────────────────────────────────────────────────────────────────────────
// Đường dẫn
// ─────────────────────────────────────────────────────────────────────────────

/** Chuẩn hoá về dạng POSIX, tương đối so với gốc repo. Dùng cho MỌI so khớp glob. */
export function toRepoRel(p) {
  if (!p) return '';
  const abs = resolve(String(p));
  const rel = relative(REPO_ROOT, abs);
  // File ngoài repo → trả về đường dẫn tuyệt đối dạng POSIX để glob vẫn so được
  const base = rel.startsWith('..') ? abs : rel;
  return base.split(sep).join('/').replace(/^\.\//, '');
}

export function repoPath(...parts) {
  return join(REPO_ROOT, ...parts);
}

// ─────────────────────────────────────────────────────────────────────────────
// Glob tối giản (không dependency) — đủ cho cú pháp dùng trong harness.config.json
// Hỗ trợ: **  *  ?  {a,b}  và tiền tố thư mục.
// ─────────────────────────────────────────────────────────────────────────────

function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // '**/' nuốt luôn dấu / để '**/x' khớp cả 'x' ở gốc
        if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; }
        else { re += '.*'; i += 1; }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end === -1) { re += '\\{'; continue; }
      const alts = glob.slice(i + 1, end).split(',').map(a => a.replace(/[.+^${}()|[\]\\]/g, '\\$&'));
      re += `(?:${alts.join('|')})`;
      i = end;
    } else if ('.+^$()|[]\\'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp(`^${re}$`);
}

const _globCache = new Map();

/** So khớp một đường dẫn POSIX với một glob. */
export function matchGlob(pathPosix, glob) {
  if (!_globCache.has(glob)) _globCache.set(glob, globToRegExp(glob));
  return _globCache.get(glob).test(pathPosix);
}

/**
 * So khớp với một danh sách glob, hỗ trợ PHỦ ĐỊNH `!glob` theo đúng luật `.gitignore`: duyệt từ trên
 * xuống, pattern SAU ghi đè pattern TRƯỚC.
 *
 * Vì sao cần: `paths.secrets` muốn nói "mọi file .env — TRỪ .env.example". Không có phủ định thì chỉ
 * còn hai lựa chọn, cả hai đều sai — để `**\/.env.*` thì chặn luôn `.env.example` (file mà
 * `tooling/init.mjs` CẦN và `.gitignore` đã whitelist, nên pre-commit báo sai ở commit ĐẦU TIÊN của
 * mọi project mới), hoặc liệt kê tay từng hậu tố env (quên một cái là hở một secret thật).
 *
 *   matchAny('.env.example',    ['**\/.env.*', '!**\/.env.example'])  → false
 *   matchAny('.env.production', ['**\/.env.*', '!**\/.env.example'])  → true
 */
export function matchAny(pathPosix, globs) {
  let hit = false;
  for (const g of globs || []) {
    if (typeof g !== 'string' || g === '') continue;
    if (g.startsWith('!')) {
      if (matchGlob(pathPosix, g.slice(1))) hit = false;
    } else if (matchGlob(pathPosix, g)) {
      hit = true;
    }
  }
  return hit;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cấu hình
// ─────────────────────────────────────────────────────────────────────────────

let _config = null;

/**
 * Đọc harness.config.json (có cache). Không bao giờ throw — thiếu file thì trả default rỗng.
 *
 * `HARNESS_CONFIG` trỏ sang một file config KHÁC. Chỉ dùng cho TEST: nó để `tooling/test-hooks.mjs`
 * assert LOGIC của hook trên một config dựng sẵn, thay vì assert lên config THẬT của project.
 * Không có nó, các case "lệnh chưa khai → bỏ qua" chỉ xanh khi project chưa cấu hình gì — tức là
 * điền `commands` (việc SỐ 1 khi áp template) làm chính test suite của harness đỏ.
 */
export function config() {
  if (_config) return _config;
  const defaults = {
    project: { id: 'unknown', dri: '', issuePrefixes: [], platforms: [] },
    commands: {}, paths: {}, limits: {}, gates: { stop: [], preMerge: [] }, knowledge: {},
  };
  try {
    const override = process.env.HARNESS_CONFIG;
    const raw = JSON.parse(readFileSync(override || repoPath('harness.config.json'), 'utf8'));
    _config = {
      ...defaults, ...raw,
      project: { ...defaults.project, ...(raw.project || {}) },
      commands: { ...(raw.commands || {}) },
      paths: { ...(raw.paths || {}) },
      limits: { ...(raw.limits || {}) },
      gates: { ...defaults.gates, ...(raw.gates || {}) },
      knowledge: { ...(raw.knowledge || {}) },
    };
  } catch {
    _config = defaults;
  }
  return _config;
}

export function pathsFor(key) {
  return config().paths?.[key] ?? [];
}

export function limit(key, fallback) {
  const v = config().limits?.[key];
  return typeof v === 'number' ? v : fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chạy lệnh
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Chạy một lệnh khai báo trong harness.config.json.
 * Trả về { skipped } nếu lệnh chưa được khai báo — đây là hành vi CỐ Ý:
 * template phải chạy được trên project chưa cấu hình đủ.
 */
export function runConfigured(name, { placeholders = {}, capture = false, cwd = REPO_ROOT } = {}) {
  let cmd = config().commands?.[name];
  if (!cmd || !String(cmd).trim()) return { skipped: true, status: 0, stdout: '', stderr: '' };

  for (const [k, v] of Object.entries(placeholders)) {
    cmd = cmd.replaceAll(`{${k}}`, JSON.stringify(String(v)));
  }

  const r = spawnSync(cmd, {
    shell: true, // chuỗi lệnh từ config của chính repo — tin cậy
    cwd,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  });
  return {
    skipped: false,
    status: r.status ?? 1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

/** Chạy lệnh dạng mảng args (an toàn với path có dấu cách). */
export function run(bin, args = [], { cwd = REPO_ROOT, capture = true, input } = {}) {
  const r = spawnSync(bin, args, {
    cwd, encoding: 'utf8', input,
    shell: IS_WIN, // Windows cần shell để resolve .cmd/.ps1 shim
    stdio: capture ? 'pipe' : 'inherit',
  });
  return { status: r.status ?? 1, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() };
}

export function git(args, opts = {}) {
  return run('git', args, opts);
}

/** Nhánh hiện tại, hoặc '' nếu không ở trong git repo. */
export function currentBranch() {
  const r = git(['branch', '--show-current']);
  return r.status === 0 ? r.stdout : '';
}

/** Suy ra mã issue từ tên nhánh: feat/ABC-142-slug → ABC-142 */
export function issueFromBranch(branch = currentBranch()) {
  const prefixes = config().project?.issuePrefixes ?? [];
  const generic = branch.match(/[A-Z][A-Z0-9]+-\d+/);
  if (generic) return generic[0];
  for (const p of prefixes) {
    const m = branch.match(new RegExp(`${p}[-_]?(\\d+)`, 'i'));
    if (m) return `${p}-${m[1]}`;
  }
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Giao thức hook
// ─────────────────────────────────────────────────────────────────────────────

/** Đọc JSON hook input từ stdin. Không bao giờ throw. */
export function hookInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

export const EXIT_OK = 0;
export const EXIT_BLOCK = 2;

/** Chặn tool call và giải thích CÁCH SỬA (không chỉ nói sai). */
export function block(message, howToFix) {
  console.error(`⛔ BỊ CHẶN: ${message}`);
  if (howToFix) console.error(`   → ${howToFix}`);
  process.exit(EXIT_BLOCK);
}

export function pass() {
  process.exit(EXIT_OK);
}

/** Rút file_path từ mọi biến thể tool input (Write/Edit/NotebookEdit). */
export function toolFilePath(input) {
  const ti = input?.tool_input ?? {};
  return ti.file_path ?? ti.path ?? ti.notebook_path ?? '';
}

export function toolCommand(input) {
  return String(input?.tool_input?.command ?? '');
}

export function toolContent(input) {
  const ti = input?.tool_input ?? {};
  return String(ti.content ?? ti.new_string ?? ti.new_source ?? '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Telemetry (cá nhân, gitignore) — nguyên liệu của vòng học
// ─────────────────────────────────────────────────────────────────────────────

export function telemetryDir() {
  const d = repoPath('.claude', 'telemetry');
  try { mkdirSync(d, { recursive: true }); } catch {}
  return d;
}

/** Ghi một dòng vào log telemetry. `kind` = tên file không đuôi. */
export function telemetry(kind, fields) {
  try {
    const line = [new Date().toISOString(), config().project?.id ?? '-', ...fields.map(f => String(f).replace(/[|\n\r]/g, ' '))].join('|');
    appendFileSync(join(telemetryDir(), `${kind}.log`), line + '\n', 'utf8');
  } catch {}
}

/** Ghi output dài ra file tạm và trả đường dẫn — GIỮ CONTEXT SẠCH. */
export function spill(name, content) {
  try {
    const f = join(tmpdir(), `harness-${name}-${process.pid}.log`);
    writeFileSync(f, content, 'utf8');
    return f;
  } catch {
    return '(không ghi được file log)';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiện ích
// ─────────────────────────────────────────────────────────────────────────────

export function readJson(p, fallback = null) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
}

export function writeJson(p, obj) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

export function exists(p) {
  return existsSync(p);
}

/** In báo cáo NGẮN, có hành động. Dùng cho mọi script trong tooling/. */
export function report(title, { ok = [], warn = [], fail = [] }) {
  console.log(`\n=== ${title} ===`);
  for (const m of ok) console.log('  OK   ' + m);
  for (const m of warn) console.log('  WARN ' + m);
  for (const m of fail) console.log('  FAIL ' + m);
  if (!ok.length && !warn.length && !fail.length) console.log('  (không có gì để báo cáo)');
  console.log('');
  return fail.length === 0;
}

export { homedir, tmpdir };
