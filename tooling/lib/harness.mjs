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

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative, resolve, sep, dirname } from 'node:path';
import { tmpdir, platform, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from './frontmatter.mjs';

export const IS_WIN = platform() === 'win32';

/**
 * TRẦN OUTPUT cho mọi `spawnSync` có `stdio: 'pipe'` trong harness.
 *
 * Mặc định của Node là **1 MiB**, và vượt ngưỡng thì nó **KHÔNG truncate — nó GIẾT tiến trình
 * con** (SIGTERM, `status: null`, `error.code = 'ENOBUFS'`). Một lệnh chạy đúng và exit 0 đọc
 * ra là thất bại, với output đã bị cắt cụt mà không có tín hiệu nào.
 *
 * MỘT hằng số, vì tới v2.75.0 ngưỡng này đã có **ba** bản chép rời nhau (`runConfigured`,
 * `evals/run.mjs`, và chỗ thứ ba là `run()` — nơi vốn KHÔNG khai gì cả). Ba bản chép của một
 * ngưỡng thì trôi khỏi nhau, và bản trôi chậm nhất là bản không ai nhớ là nó tồn tại — cùng lý
 * do `versionCmp`, `codeOnly`, `handledGroups` đều đã phải gom về một chỗ.
 *
 * 64 MiB: đủ rộng để không bao giờ là ngưỡng thật trong thực tế, vẫn còn là một cái trần (một
 * lệnh in vô hạn phải chết, không được ăn hết RAM).
 */
export const MAX_BUFFER = 64 * 1024 * 1024;

/**
 * MỘT FILE LEARNINGS CÓ PHẢI ỨNG VIÊN PROMOTE KHÔNG — THUẦN, nhận nội dung file.
 *
 * `/knowledge-promote` đếm file trong `.claude/learnings/` mới hơn bài học mới nhất. Phép đếm
 * đó gộp hai câu khác nhau: *"có bài học tồn tại"* và *"có bài học SẴN SÀNG promote"*. Hệ quả
 * đo được 2026-08-05 và còn nguyên tới 2026-08-13: `/harness-retro` **bắt buộc** ghi một file
 * vào `.claude/learnings/`, nên chạy đúng hai nghi thức theo đúng thứ tự kết thúc bằng đèn đỏ
 * y như lúc bắt đầu — kể cả khi kết luận của retro là *"không có gì đáng promote"*.
 *
 * Một tín hiệu mà hành động ĐÚNG không tắt được là tín hiệu sẽ bị bỏ qua (`L0008`).
 *
 * Cửa ra: file tự khai `promote:` trong frontmatter. Mặc định VẮNG = vẫn là ứng viên, nên
 * 17 file learnings đang có không đổi hành vi — cửa này chỉ mở khi có người chủ động khai.
 *
 * Trả **lý do** (chuỗi) nếu đã khai KHÔNG promote, `null` nếu vẫn là ứng viên. Trả lý do chứ
 * không trả boolean vì cùng lý do `--close` bắt buộc có lý do: một mục bị tắt mà không ghi vì
 * sao thì lần sau không ai dựng lại được quyết định.
 */
export function promoteDeclined(src) {
  let data;
  try { ({ data } = parseFrontmatter(String(src))); } catch { return null; }
  const v = data?.promote;
  if (v == null) return null;
  const s = String(v).trim();
  // `candidate`/`yes`/`true` = khai RÕ rằng nó vẫn đang chờ promote. Khai rỗng cũng vậy —
  // một trường bỏ trống là chưa quyết, không phải đã quyết là không.
  if (!s || /^(candidate|yes|true)$/i.test(s)) return null;
  return s;
}

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

/**
 * Số người làm project này — `project.teamSize`. Trả về `null` khi CHƯA KHAI.
 *
 * BA GIÁ TRỊ, KHÔNG PHẢI HAI. `null` (chưa hỏi) **không** được gộp vào `1` (solo):
 * gộp như vậy là mọi repo chưa chạy `setup.mjs` tự nhiên mất lớp phối hợp mà không ai
 * quyết định điều đó — đúng chiều dễ chịu, đúng lớp lỗi mà cả repo này đi sửa suốt W32.
 *
 * Chỉ có `isSolo()` mới tắt được thứ gì, và nó đòi một con số NGƯỜI đã trả lời.
 */
export function teamSize() {
  const v = config().project?.teamSize;
  return Number.isInteger(v) && v > 0 ? v : null;
}

/**
 * `true` CHỈ KHI người đã khai đúng 1. Chưa khai ⇒ `false` ⇒ giữ nguyên lớp phối hợp.
 *
 * Vì sao mặc định nghiêng về "có đội": bỏ sót một guard phối hợp thì hỏng im lặng và chỉ
 * lộ ra khi hai người đã giẫm chân nhau; bật thừa một guard thì tốn vài giây và NHÌN THẤY
 * được. Hai chế độ hỏng không cân nhau, nên mặc định không được ở giữa.
 */
export function isSolo() {
  return teamSize() === 1;
}

/**
 * PHÁN ĐOÁN của mục "LỚP PHỐI HỢP" trong `harness-doctor` — hàm THUẦN, test khẳng định
 * thẳng vào đây. Cùng lý do với `governanceDrift`: `harness-doctor` CHẠY `test-hooks.mjs`,
 * nên một test spawn doctor sẽ đệ quy lẫn nhau (đã đo, suite treo >120 giây).
 *
 * BỐN trạng thái, không ba. `template` là trạng thái riêng và nó KHÔNG sinh advice:
 * `harness.config.json` là SEED, nên một con số ở repo template ship sang MỌI consumer như
 * câu trả lời của họ. "Chưa khai" là trạng thái ĐÚNG ở đó — advice đòi sửa nó là advice
 * không ai được phép làm theo, đúng bug #56 (`session-start.mjs:203`).
 */
/**
 * PHÁN ĐOÁN của mục "LỚP XÁC MINH" trong `harness-doctor` — hàm THUẦN, cùng lý do tách như
 * `coordinationLayer` và `governanceDrift`: doctor CHẠY `test-hooks.mjs`, nên test spawn
 * doctor sẽ đệ quy.
 *
 * VẤN ĐỀ NÓ BẮT — đo 2026-08-07 (`/harness-retro` §2):
 *
 *     sakubun-single-user   harness: CÓ (v2.13.0)   features/ thật: 0
 *
 * Repo ĐÃ ship và đang NỢ xác minh thật (4 mục auto-memory qua 2 project ghi "pending live
 * verify"), nhưng `features/*.json` — cơ chế default-FAIL + `evidence` mà `AGENTS.md` gọi là
 * "không thương lượng" — CHƯA DÙNG LẦN NÀO.
 *
 * Nó không tự lộ ra vì MẪU SỐ BẰNG 0: `check-feature-integrity`, gate `preMerge` và
 * `/verify-ui` đều lặp qua `features/*.json`. Không feature nào ⇒ lặp qua tập rỗng ⇒ XANH.
 * Mẫu số 0 làm mọi tỉ lệ thành 100%. Cùng lớp lỗi `evals/run.mjs` sửa ở v2.24.0, nhưng
 * NGƯỢC CHIỀU — ở đó "chưa đo" thành FAIL, ở đây thành PASS. Chiều PASS nguy hiểm hơn:
 * không ai đi điều tra một dấu tick xanh.
 *
 * NĂM trạng thái. Hai vế của cảnh báo là bắt buộc:
 *   · `template`   — repo template không có feature thật theo thiết kế ⇒ KHÔNG advice.
 *                    Bỏ vế này là tái tạo #56 lần thứ ba.
 *   · `quiet`      — không commit nào 7 ngày qua ⇒ chưa ship gì thì chưa nợ gì. Bỏ vế này
 *                    là nổ ở mọi repo mới toanh và thành nhiễu ngay ngày đầu.
 *   · `unknown`    — không đọc được lịch sử git ⇒ `?`, KHÔNG phải "ổn".
 *   · `covered`    — có feature thật.
 *   · `empty`      — có commit mà 0 feature ⇒ đây là ca duy nhất sinh advice.
 */
export function verificationCoverage({ role, features, commits7d } = {}) {
  if (role === 'template') return { mode: 'template-na', advice: null };
  if (commits7d == null) return { mode: 'unknown', advice: null };
  if (features > 0) return { mode: 'covered', advice: null };
  if (commits7d === 0) return { mode: 'quiet', advice: null };
  return {
    mode: 'empty',
    advice: `${commits7d} commit trong 7 ngày qua, 0 feature được khai trong features/ ⇒ `
      + 'check-feature-integrity, gate preMerge và /verify-ui đang chạy trên TẬP RỖNG. '
      + 'Mọi tỉ lệ xác minh của repo này hiện là 100% vì mẫu số bằng 0. '
      + 'Khai feature: cp features/_TEMPLATE.json features/<id>.json',
  };
}

export function coordinationLayer({ teamSize: ts, role } = {}) {
  if (ts === 1) return { mode: 'solo', advice: null };
  if (Number.isInteger(ts) && ts > 1) return { mode: 'team', advice: null };
  if (role === 'template') return { mode: 'template-na', advice: null };
  return {
    mode: 'unknown',
    advice: '`project.teamSize` chưa khai — harness không biết đây là solo hay đội, nên giữ đủ '
      + 'lớp phối hợp liên-người (đặt chỗ, CODEOWNERS, "hỏi người"). Solo thì `node tooling/setup.mjs` tắt phần thừa.',
  };
}

/**
 * ═══ CONFIG COVERAGE: HAI CHIỀU ═════════════════════════════════════════════
 *
 * Lớp lỗi này đã bị sửa BẰNG TAY ba lần — `budget.modelTiering` (2.0.0),
 * `budget.monthlyUsdCap` (2.28.0), `budget.maxToolCallsPerRun` (2.35.0) — mỗi lần một
 * bia mộ trong config, không lần nào dựng máy dò. Ba field khác sống sót vì không ai tìm.
 *
 * HAI CHIỀU, và chúng KHÔNG đối xứng — đây là quyết định thiết kế, không phải tối ưu:
 *
 *   A "có gì tiêu thụ field này không?"    → quét code + MARKDOWN.
 *      Một skill bảo agent đọc `limits.reservationTtlHours` LÀ một người tiêu thụ; nó
 *      chỉ là inferential thay vì computational. Bỏ markdown ⇒ báo nhầm nó là chết.
 *
 *   B "code với tay tới thứ không tồn tại?" → quét CHỈ code.
 *      `harness-migrations/README.md` có một ví dụ migration GIẢ ĐỊNH dùng
 *      `cfg.paths.hotspots`. Đó là văn xuôi dạy người viết migration, không phải reader.
 *      Nhận markdown vào chiều B ⇒ một dương tính giả ngay ngày đầu ⇒ check bị tắt.
 *
 * `blankStrings: false` là CỐ Ý, và NGƯỢC với check `lib-import`. Tên field sống TRONG
 * chuỗi: `limit('staleLockMinutes', 5)`. Xoá ruột chuỗi là xoá đúng thứ đang đi tìm —
 * bản đầu của phép quét này báo nhầm SÁU field vì đúng lỗi đó. `codeOnly` vẫn bỏ CHÚ
 * THÍCH, và đó là phần cần thiết: một comment nhắc tên field không phải là ĐỌC nó.
 *
 * `fixtures/` bị loại: chúng dựng config GIẢ nên chúng "đọc" mọi field, và một phép quét
 * gồm chúng thì luôn xanh. Cùng lớp với "template là mẫu vật không điển hình".
 */
const CFG_ACCESSORS = [
  [/\blimit\(\s*['"]([\w-]+)['"]/g, 'limits'],
  [/\bpathsFor\(\s*['"]([\w-]+)['"]/g, 'paths'],
  [/\brunConfigured\(\s*['"]([\w-]+)['"]/g, 'commands'],
];

/** THUẦN — nhận hai chuỗi nguồn, không chạm đĩa. Đây là phần test-hooks kiểm. */
export function configCoverageOf({ cfg, srcAll, srcCode }) {
  const leaves = [];
  const documented = new Set();
  const walkCfg = (o, path = []) => {
    for (const [k, v] of Object.entries(o || {})) {
      if (k.startsWith('$comment_')) { documented.add(k.slice('$comment_'.length)); continue; }
      if (k === '$comment') continue;
      if (v && typeof v === 'object' && !Array.isArray(v)) walkCfg(v, [...path, k]);
      else leaves.push([...path, k]);
    }
  };
  walkCfg(cfg);

  // CHIỀU A
  const unread = leaves
    .filter(p => !new RegExp(`\\.${p.at(-1)}\\b|['"\`]${p.at(-1)}['"\`]`).test(srcAll))
    .map(p => p.join('.'));

  // CHIỀU B
  const hit = new Set();
  const has = (s, f) => cfg[s] && Object.prototype.hasOwnProperty.call(cfg[s], f);
  for (const [re, section] of CFG_ACCESSORS)
    for (const m of srcCode.matchAll(re)) if (!has(section, m[1])) hit.add(`${section}.${m[1]}`);
  // `cfg.X.Y` / `config().X.Y` / `c.X.Y`. Lọc `!cfg[section]` là thứ giữ phép này an toàn:
  // chỉ section CÓ THẬT trong config mới được xét, nên `c.foo.bar` của một biến khác trôi qua.
  for (const m of srcCode.matchAll(/\b(?:cfg|config\(\)|c)\.(\w+)\??\.(\w+)\b/g)) {
    const [, section, field] = m;
    if (cfg[section] && !has(section, field)) hit.add(`${section}.${field}`);
  }
  const all = [...hit].sort();
  const excused = all.filter(k => documented.has(k.split('.').at(-1)));
  const undeclared = all.filter(k => !documented.has(k.split('.').at(-1)));

  return { leaves: leaves.length, unread, undeclared, excused };
}

const COV_ROOTS = /^(tooling|evals|harness-migrations)\/|^\.claude\/(hooks|skills)\/|^\.github\//;

/** IO: gom nguồn từ file ĐƯỢC TRACK rồi gọi phần thuần. */
export function configCoverage(cfg = config()) {
  const listed = git(['ls-files']).stdout.split('\n').filter(Boolean);
  // Không đọc được danh sách file ⇒ CHƯA ĐO, không phải "sạch". Ba trạng thái.
  if (!listed.length) return { leaves: 0, unread: [], undeclared: [], excused: [], scanned: 0, tracked: 0, unknown: true };
  let srcAll = '', srcCode = '', scanned = 0, rejected = 0;
  for (const f of listed) {
    const isCode = /\.(mjs|js)$/.test(f);
    if (!isCode && !/\.(ya?ml|md)$/.test(f)) continue;
    // ĐẾM RIÊNG file bị PHẠM VI loại (không phải file bị đuôi loại). Đây là số duy nhất
    // phân biệt "COV_ROOTS đang lọc" với "COV_ROOTS đã bị vô hiệu": mở toang phạm vi thì
    // phép lọc đuôi vẫn giữ `scanned < tracked`, nên so hai số đó KHÔNG bắt được gì.
    if (!COV_ROOTS.test(f) || f.includes('fixtures/')) { rejected++; continue; }
    // File TEST là fixture ở dạng khác: chúng dựng config GIẢ và viết accessor GIẢ để chứng
    // minh phép quét chạy. `srcCode` gồm chúng ⇒ chiều B báo `limits.doDot`, `paths.hotspots`
    // — tên trong fixture của CHÍNH nó. Đây là lần thứ tư trong repo này một phép quét mã
    // nguồn khớp phải lời giải thích/bằng chứng của chính nó.
    // Chỉ loại khỏi chiều B: chiều A giữ chúng, vì một test ĐỌC field thật thì đó là người đọc thật.
    const isTestMaterial = /(^|\/)test-[^/]*\.(mjs|js)$/.test(f);
    let raw = ''; try { raw = readFileSync(repoPath(f), 'utf8'); } catch { continue; }
    const t = isCode ? codeOnly(raw, { blankStrings: false }) : raw;
    srcAll += t;
    if ((isCode || /\.ya?ml$/.test(f)) && !isTestMaterial) srcCode += t;
    scanned++;
  }
  // `scanned`/`tracked` KHÔNG phải thống kê trang trí — chúng là thứ DUY NHẤT khoá được
  // PHẠM VI. Mở toang `COV_ROOTS` thì phép quét đọc cả `HARNESS-CHANGELOG.md` và `docs/`,
  // nơi mọi tên field đều được nhắc (bia mộ!), nên MỌI field đọc thành "có người đọc" và
  // phép quét câm — im lặng, và đúng chiều hỏng của L0007. Không con số nào khác phát hiện được.
  return { ...configCoverageOf({ cfg, srcAll, srcCode }), scanned, rejected, tracked: listed.length };
}

/**
 * ═══ CAP CHI TIÊU: NỐI FIELD VÀO SỐ ĐO THẬT ═════════════════════════════════
 *
 * `budget.monthlyUsdCap` là field MA cho tới v2.28.0: đo 2026-08-07, nơi DUY NHẤT đọc nó là
 * `harness-doctor:137`, và chỉ để nói *"= 0, không có cap"*. Đặt `50` vào cũng không có gì
 * xảy ra — không cơ chế nào so, không cơ chế nào cảnh báo. Cùng lớp với `modelTiering` bị
 * cắt ở 2.0.0: **một niềm tin được đóng gói thành cấu hình**.
 *
 * NGUỒN SỐ ĐO LÀ NGƯỜI GÕ, VÀ MỌI THÔNG BÁO PHẢI NÓI RA ĐIỀU ĐÓ. `capo-history.json` chỉ có
 * dữ liệu khi ai đó chạy `capo-report.mjs --usd <N>`, với `N` chép từ dashboard billing.
 * Harness KHÔNG đọc được hoá đơn. Giấu chuyện đó đi là chế tạo độ chính xác giả — người đọc
 * sẽ tin con số này như tin một cái đồng hồ, trong khi nó là một tấm ảnh chụp tuần trước.
 *
 * KHÔNG CỘNG các entry lại. Mỗi entry là *"`days` ngày qua tiêu `usd`"*, và các cửa sổ CHỒNG
 * LÊN NHAU (chạy hàng tuần với `--days 30` ⇒ cộng vào là gấp bốn). Dùng entry MỚI NHẤT và
 * quy ra **run-rate** `usd / days * 30`. Nói rõ "run-rate", không nói "đã tiêu tháng này".
 *
 * TÁM trạng thái, và hai trong số đó là `?`:
 *   · `off`        — cap = 0 ⇒ chưa khai trần. Không phải "ổn".
 *   · `unmeasured` — cap > 0 mà chưa lần nào đo ⇒ `?`. Đây là ca nguy hiểm nhất: một con số
 *                    trong config làm người ta TIN là có lớp bảo vệ. Nó phải kêu.
 *   · `stale`      — số đo cũ hơn 45 ngày ⇒ `?`. Một trần THÁNG neo vào phép đo từ hai tháng
 *                    trước không nói gì về tháng này.
 *   · `ok` / `alert` / `over`
 *   · `template-na` / `template-cap` — xem ngay dưới.
 *
 * ── VAI CỦA REPO (issue #92)
 *
 * `setup.mjs:55` TỪ CHỐI `--apply` ở repo template, và từ chối đó đúng: một con số cap ghi ở
 * đây sẽ chảy xuống MỌI consumer áp template sau này. Nhưng cho tới #92, hàm này không nhận
 * `role`, nên nó trả `off` — *"chưa khai trần, KHÔNG phải ổn"* — ở đúng nơi harness cấm khai.
 * **Harness đòi một thứ mà chính harness cấm cung cấp**, và không có đường nào làm mục đó xanh.
 *
 * Bốn chỗ khác trong `harness-doctor.mjs` đã biết vai (`placeholder()`, `verificationCoverage`,
 * `coordinationLayer`, và khối CẤU HÌNH). Chỗ thứ năm thì không — cùng hình dạng với nhóm 1
 * của retro W32 lần ba (#90): một bài học áp ở vài chỗ và không tổng quát hoá.
 *
 * TÁCH HAI TRẠNG THÁI ĐANG BỊ GỘP. Ở template, `?` cũ trộn hai chuyện khác hẳn nhau:
 *   1. **Trần tháng** — không khai được, và đó là ĐÚNG THIẾT KẾ ⇒ `n/a`.
 *   2. **Phép đo CAPO** — `capo-report.mjs` KHÔNG đọc `monthlyUsdCap` (nó ghi vào
 *      `stateDir()/capo-history.json`), nên nó CHẠY ĐƯỢC ở template và chưa lần nào chạy
 *      ⇒ `due`, việc làm được.
 * Gộp hai cái làm mất mục (2) — thứ thật sự làm được — sau lưng mục (1). Cờ `measured` tồn
 * tại để bên gọi tách lại được.
 */
/**
 * Gói cước nào — `metered` (trả theo mức dùng) hay `flat` (subscription phẳng). HÀM THUẦN.
 *
 * HAI TẦNG, và thứ tự có lý do:
 *   1. `HARNESS_BUDGET_PLAN` (env, `settings.local.json`) — THEO NGƯỜI, thắng
 *   2. `budget.plan` (config) — mặc định của ĐỘI
 *
 * Vì sao cần tầng 1: gói cước là thuộc tính của NGƯỜI TRẢ TIỀN, không phải của project. Một
 * đội có thể có người dùng Pro phẳng và người dùng API theo mức dùng; ép cả hai theo một khoá
 * trong config là báo sai cho ít nhất một người.
 *
 * Vì sao vẫn cần tầng 2: một khoá chỉ tồn tại trong env là khoá **không ai thấy khi đọc
 * config** — và `tooling/test-hooks.mjs` có một cái gác cho đúng chuyện đó (mã nguồn ĐỌC mà
 * config KHÔNG khai). Tầng 2 là chỗ khoá này tự giới thiệu.
 *
 * Giá trị lạ ⇒ `metered`, KHÔNG ném. Đây là đường đọc của một bảng điều khiển: một lỗi chính
 * tả trong config không được làm cả `harness-doctor` chết.
 */
export function budgetPlan(cfg = null, env = process.env) {
  const raw = String(env.HARNESS_BUDGET_PLAN || cfg?.budget?.plan || '').trim().toLowerCase();
  return raw === 'flat' ? 'flat' : 'metered';
}

/**
 * Đếm số lần chạm rate limit trong `budget-alarm.log` — **THUẦN**, nhận text, trả số.
 *
 * Với gói phẳng đây là toàn bộ phép đo: tiền không phải cổ chai, rate limit mới là. Nó nằm ở
 * `lib` chứ không inline trong `harness-doctor` vì đúng một lý do — bản trước inline, và **cả
 * nhánh phẳng chưa từng đếm được lần nào**. Hai lỗi chồng lên nhau (#122):
 *
 *   ① `telemetryDir` KHÔNG có trong danh sách import của `harness-doctor.mjs`, nên lời gọi ném
 *      `ReferenceError` — và `catch { return null }` (viết với nghĩa "đọc sổ hỏng ⇒ không
 *      biết") nuốt luôn nó. Kết quả: `flat-unmeasured` VĨNH VIỄN, trên một cái sổ đọc được.
 *   ② `tallyLines` trả `Map<key, {sub: count}>` — giá trị là **object**. `reduce((s,[,n]) => s+n, 0)`
 *      cho `"0[object Object]"`, rồi `Number()` ra `NaN` ⇒ rơi xuống `flat-ok` với **0**, trong
 *      khi sổ có **12**. Sai theo chiều DỄ CHỊU, `L0005` ở dạng nguyên bản.
 *
 * 13 ca của #111 kiểm `budgetStatus` — hàm thuần — bằng `rateLimitHits` TRUYỀN TAY. Ranh giới
 * test dừng đúng trước chỗ hỏng. Đưa phép đếm vào đây là dời ranh giới đó qua chỗ hỏng.
 *
 * `null` = KHÔNG ĐỌC ĐƯỢC, `0` = đọc được và chưa lần nào chạm. Hai câu khác nhau.
 */
/**
 * Ảnh chụp ngân sách — **một phép IO cho MỌI bên đọc**. Trả về đúng thứ `budgetStatus` trả về.
 *
 * Tồn tại vì một lý do đo được, không vì gọn gàng. `harness-doctor` và `rituals` đều gọi
 * `budgetStatus`, và `rituals` **quên truyền `rateLimitHits`**. Mặc định của tham số đó là
 * `null`, `null` ⇒ `flat-unmeasured` — đúng theo hợp đồng ba trạng thái, không ném, không đỏ.
 * Kết quả đo 2026-08-08 (#125), hai công cụ đọc CÙNG một cái sổ:
 *
 *   harness-doctor  →  ⚠️ gói PHẲNG · 12 lần chạm rate limit
 *   rituals         →  ?  KHÔNG đo được — chưa đọc được `budget-alarm.log`
 *
 * Và `rituals` là cái chạy ở **mỗi SessionStart**, nên câu sai là câu người dùng thấy hằng ngày.
 *
 * `lib-import` (#122) không thấy được lỗ này: nó bắt **tên được gọi mà chưa import**, còn đây
 * là một **đối số không được truyền**. Nên bản vá đúng không phải thêm một luật phải nhớ, mà là
 * **bỏ chỗ để quên**: gộp phép IO vào một hàm, và không bên đọc nào còn tự lắp tham số nữa.
 */
export function budgetSnapshot(cfg = null, role = null, now = Date.now()) {
  const c = cfg ?? config();
  let hits = null;
  try {
    const f = join(telemetryDir(), 'budget-alarm.log');
    hits = existsSync(f) ? rateLimitHitsIn(readFileSync(f, 'utf8'), now - 30 * 86400000) : 0;
  } catch { hits = null; }   // đọc hỏng ⇒ KHÔNG BIẾT — `?`, không phải 0
  return budgetStatus({
    cap: c.budget?.monthlyUsdCap,
    alertAtPercent: c.budget?.alertAtPercent,
    latest: latestCapoEntry(),
    flatCapo: flatCapoEntries(),
    role: role ?? repoRole(),
    plan: budgetPlan(c),
    // Giá trị THÔ trong config, không phải giá trị đã hợp nhất với env — `budgetStatus` cần biết
    // gói phẳng này CÓ chảy xuống consumer hay không, và chỉ nguồn config mới chảy.
    configPlan: c.budget?.plan ?? null,
    rateLimitHits: hits,
    now,
  });
}

export function rateLimitHitsIn(text, sinceMs = 0) {
  if (typeof text !== 'string') return null;
  let total = 0;
  for (const [key, subs] of tallyLines(text, { field: 2, sinceMs })) {
    if (!/rate.?limit|quota/i.test(key)) continue;
    // Giá trị của `tallyLines` là một bảng con {trường-kế-tiếp: số lần}. Cộng CÁC GIÁ TRỊ của
    // nó, không cộng chính nó — đó là toàn bộ lỗi ②.
    for (const n of Object.values(subs)) total += Number(n) || 0;
  }
  return total;
}

export function budgetStatus({ cap, alertAtPercent = 80, latest = null, now = Date.now(), role = null,
  plan = 'metered', configPlan = null, rateLimitHits = null, flatCapo = [] } = {}) {
  const c = Number(cap);
  // MỘT phép kiểm "số đo có dùng được không", dùng ở CẢ HAI chỗ cần nó: cờ `measured` (nhánh
  // template) và mode `unmeasured` (nhánh có cap). Viết hai lần thì hai bản sẽ lệch, và lúc
  // lệch thì template báo "đã đo" trong khi repo có cap báo "chưa đo" trên CÙNG một entry.
  const usd = Number(latest?.usd), days = Number(latest?.days);
  const at = Date.parse(latest?.at ?? '');
  const measured = Number.isFinite(usd) && Number.isFinite(days) && days > 0 && Number.isFinite(at);

  // ── HAI FIELD, MỘT ĐƯỜNG RÒ XUỐNG CONSUMER ────────────────────────────────
  //
  // `apply-to.mjs:48` chép `harness.config.json` xuống MỌI consumer. `monthlyUsdCap` đã có gác
  // cho đường đó (`template-cap`, #92). `budget.plan` thì chưa — và nó rò NẶNG HƠN: một cap sai
  // chỉ mang theo một con số sai, còn `plan: flat` thừa kế **tắt hẳn phép so cap**. Đo
  // 2026-08-13, consumer cap $50 với chi thật $500/30 ngày:
  //
  //     plan metered         → `over`, 1000%                ← gác nổ
  //     plan flat (thừa kế)  → `flat-limited`, percent=null  ← cap không so với gì cả
  //
  // Không phải rủi ro giả định. `setup.mjs` KHÔNG hỏi `plan`, nên đường DUY NHẤT field này vào
  // config là sửa TAY — và sửa tay vào vùng cấm thì `harness-edits.log` không thấy (sổ đó chỉ
  // ghi lệnh đi qua tool, `protect-harness.mjs` vẫn chặn nguyên). Xảy ra thật trên máy này
  // 2026-08-13 09:50; thứ phát hiện ra là `git status`, không phải harness.
  //
  // Phân biệt theo NGUỒN, không theo giá trị. `configPlan` là thứ chảy xuống; `HARNESS_BUDGET_PLAN`
  // thì không — nó ở `settings.local.json` của từng người, đúng như `$comment_plan` khai. Nên gói
  // phẳng khai bằng env ở template vẫn đo bình thường; chỉ khai bằng config mới kêu. Gộp hai
  // nguồn lại là bắn nhầm vào người đã làm ĐÚNG (`lessons/0002`).
  //
  // Vai `consumer` KHÔNG kêu, có chủ ý: ở đó `plan` không chảy đi đâu nữa, và một repo solo khai
  // gói của chính mình trong config là hợp lệ. Kêu ở đó là kêu vào 99% ca đúng.
  const templateLeak = role !== 'template' ? null
    : (Number.isFinite(c) && c > 0) ? 'cap'
      : String(configPlan).trim().toLowerCase() === 'flat' ? 'plan' : null;

  if (templateLeak === 'plan') {
    return { mode: 'template-plan', percent: null, runRate: null, measured, plan: 'flat', rateLimitHits: null,
      flatCapo: null, flatDays: null, flatAgeDays: null,
      advice: 'budget.plan = "flat" nằm trong REPO TEMPLATE — nó chảy xuống MỌI consumer áp template sau này, và ở đó nó '
        + 'TẮT phép so trần: một project có `monthlyUsdCap` thật sẽ không bao giờ được đối chiếu run-rate nữa (đo: cap $50, '
        + 'chi $500/30 ngày ⇒ `flat-limited` thay vì `over` 1000%). Gói cước là thuộc tính của NGƯỜI TRẢ TIỀN, không của '
        + 'project: đưa `budget.plan` về "metered" và khai theo máy ở `.claude/settings.local.json` → '
        + '`env.HARNESS_BUDGET_PLAN = "flat"` (env thắng config, đã có test).' };
  }

  // ── GÓI PHẲNG (#111) ──────────────────────────────────────────────────────
  //
  // Mọi thứ dưới đây giả định TRẢ THEO MỨC DÙNG: `runRate = usd/days*30` rồi so với cap. Giả
  // định đó đúng cho API pay-as-you-go và SAI cho subscription phẳng, nơi chi tiêu **bằng
  // định nghĩa** đúng bằng trần. Đo 2026-08-08 với dữ liệu ĐÚNG:
  //
  //     --days 30 --usd 20  (nguyên tháng, cap 20)  → `over`, 100%
  //     --days 7  --usd 4.67 (chia đều, cap 20)     → `over`, 100%
  //
  // `percent >= 100` luôn đúng ⇒ `over` không bao giờ tắt. Một cảnh báo luôn bật không phân
  // biệt được với một cảnh báo không tồn tại, và tệ hơn — nó dạy người đọc bỏ qua khối ngân
  // sách. Đó là `knowledge/lessons/0002-guard-ban-nham.md`.
  //
  // Với gói phẳng, ba điều đổi: chi phí BIÊN của một lần chạy là 0, chi phí tháng BIẾT TRƯỚC
  // (không cần đo), và cổ chai thật **không phải tiền mà là rate limit**. `docs/WIP.md` §"Sự
  // thật số 2" đã nói đúng điều này; cơ chế ngân sách thì chưa biết.
  //
  // ĐẶT SAU `template-cap` là chủ ý: một cap lạc vào repo template vẫn phải kêu, vì nó chảy
  // xuống mọi consumer bất kể họ dùng gói nào.
  //
  // `rateLimitHits === null` ⇒ `?`, KHÔNG phải 0. "Chưa đọc được sổ" và "chưa lần nào chạm
  // trần" là hai chuyện, và gộp chúng là đúng phép gộp AGENTS.md cấm.
  if (String(plan) === 'flat' && !templateLeak) {
    if (rateLimitHits == null) {
      return { mode: 'flat-unmeasured', percent: null, runRate: null, measured, plan: 'flat', rateLimitHits: null,
        advice: 'gói PHẲNG: tiền không phải cổ chai, rate limit mới là — nhưng chưa đọc được `budget-alarm.log` nên KHÔNG ĐO ĐƯỢC. Đây là `?`, không phải "ổn".' };
    }
    const n = Number(rateLimitHits);
    if (n > 0) {
      // HAI trạng thái, không một: "chạm trần N lần" và "chạm trần N lần VÀ tôi biết N đó
      // đổi lấy được bao nhiêu kết quả" là hai câu khác nhau, và chỉ câu thứ nhất là việc
      // TỚI HẠN. Trước #180 chỉ có câu thứ nhất, nên `rituals` báo đỏ suốt 30 ngày và KHÔNG
      // hành động nào tắt được nó — kể cả hành động chính nó yêu cầu. Một cảnh báo luôn bật
      // không phân biệt được với một cảnh báo không tồn tại (`lessons/0002`).
      const fc = flatCapoReading(flatCapo, now);
      if (fc) {
        return { mode: 'flat-capo', percent: null, runRate: null, measured, plan: 'flat', rateLimitHits: n,
          flatCapo: fc.capoTran, flatDays: fc.days, flatAgeDays: fc.ageDays, advice: null };
      }
      return { mode: 'flat-limited', percent: null, runRate: null, measured, plan: 'flat', rateLimitHits: n,
        flatCapo: null, flatDays: null, flatAgeDays: null,
        advice: `gói PHẲNG: ${n} lần chạm rate limit trong 30 ngày — ĐÂY là trần thật của bạn, không phải USD. `
          + 'Tiền không giảm được (chi phí biên = 0); thứ giảm được là số lần chạm trần: cắt context thừa, ít phiên song song hơn. Xem docs/WIP.md' };
    }
    return { mode: 'flat-ok', percent: null, runRate: null, measured, plan: 'flat', rateLimitHits: 0,
      advice: null };
  }

  if (!Number.isFinite(c) || c <= 0) {
    if (role === 'template') {
      return { mode: 'template-na', percent: null, runRate: null, measured,
        ageDays: measured ? Math.round((now - at) / 86400000) : null,
        advice: measured ? null
          : 'CAPO chưa lần nào đo. TRẦN thì không khai được ở repo template (setup.mjs từ chối — cap ở đây sẽ chảy xuống mọi consumer), '
            + 'nhưng CAPO thì đo được và không cần trần: node tooling/capo-report.mjs --days 7 --usd <số từ dashboard billing>' };
    }
    return { mode: 'off', percent: null, runRate: null, measured,
      advice: 'budget.monthlyUsdCap = 0 — chưa khai trần chi tiêu. Đây là lớp duy nhất gây thiệt hại tài chính TRỰC TIẾP. Khai: node tooling/setup.mjs · xem docs/ECONOMICS.md' };
  }
  // CHIỀU NGƯỢC, và nó phải kêu to hơn. Cap > 0 ở template nghĩa là con số đó vào bằng tay —
  // `setup.mjs` không ghi được ở đây. Nó sẽ theo `apply-to.mjs` xuống mọi consumer, và ở đó nó
  // đọc như một trần đã được cân nhắc cho project ĐÓ. Một giá trị sai thừa kế im lặng nguy
  // hiểm hơn một giá trị trống.
  if (role === 'template') {
    return { mode: 'template-cap', percent: null, runRate: null, measured,
      advice: `budget.monthlyUsdCap = $${c} trong REPO TEMPLATE — con số này sẽ chảy xuống MỌI consumer áp template sau này, `
        + 'và ở đó nó đọc như một trần đã cân nhắc cho project họ. `setup.mjs` từ chối ghi nó ở đây; nếu nó vào bằng tay thì đưa về 0.' };
  }
  if (!measured) {
    return { mode: 'unmeasured', percent: null, runRate: null, measured,
      advice: `cap $${c} đã khai nhưng CHƯA LẦN NÀO đo chi tiêu — không có gì để so, nên cap này chưa bảo vệ bạn khỏi bất cứ điều gì. Lấy số từ dashboard billing: node tooling/capo-report.mjs --usd <N>` };
  }
  // 45 ngày: một trần THÁNG cần số đo trong hoặc sát tháng này. Nới hơn thì "stale" không
  // bao giờ bật; chặt hơn thì nó kêu ngay sau một kỳ đo bình thường và thành nhiễu.
  const ageDays = Math.round((now - at) / 86400000);
  if (ageDays > 45) {
    return { mode: 'stale', percent: null, runRate: null, ageDays, measured,
      advice: `số đo chi tiêu gần nhất đã ${ageDays} ngày — trần THÁNG neo vào đó không nói gì về tháng này. Đo lại: node tooling/capo-report.mjs --usd <N>` };
  }
  const runRate = (usd / days) * 30;
  const percent = Math.round((runRate / c) * 100);
  const alert = Number.isFinite(Number(alertAtPercent)) && Number(alertAtPercent) > 0 ? Number(alertAtPercent) : 80;
  const how = `$${usd} / ${days} ngày, NHẬP TAY ${ageDays} ngày trước`;
  if (percent >= 100) {
    return { mode: 'over', percent, runRate, ageDays, measured,
      advice: `run-rate $${runRate.toFixed(0)}/tháng VƯỢT trần $${c} (${percent}%) — nguồn: ${how}. Xem docs/ECONOMICS.md` };
  }
  if (percent >= alert) {
    return { mode: 'alert', percent, runRate, ageDays, measured,
      advice: `run-rate $${runRate.toFixed(0)}/tháng = ${percent}% trần $${c} (ngưỡng cảnh báo ${alert}%) — nguồn: ${how}` };
  }
  return { mode: 'ok', percent, runRate, ageDays, measured, advice: null };
}

/**
 * ═══ BỎ COMMENT, GIỮ CODE ═══════════════════════════════════════════════════
 *
 * *"Neo vào CODE, đừng neo vào comment giải thích code"* đã gặp **bốn** lần ở repo này
 * (v2.10.2 vá guard import; `governanceDrift` báo oan `paths.harness` vì chính ghi chú của nó
 * nhắc tới khoá đó; và 2026-08-08 một assertion mới toanh của `mergeState` **không giết được
 * mutant** vì chữ `mergeState` vẫn nằm trong comment của file đã bị gỡ hết lời gọi).
 *
 * Lần thứ tư là lúc nó thôi là giai thoại và thành một hàm. Mọi phép kiểm dạng *"file X có
 * thật sự GỌI Y không"* phải đi qua đây trước.
 *
 * PHẢI BIẾT CHUỖI, và bản đầu thì không — nó đã bắn oan ngay lần dùng thứ hai. Trong
 * `rituals.mjs` có một template literal chứa `features/*.json`; cặp regex ngây thơ đọc đó là
 * MỞ block comment, rồi nuốt từ dòng 173 tới `*\/` thật ở dòng 349 — **176 dòng code biến
 * mất**, và một assertion dựng trên nó báo thiếu một thứ đang nằm ngay trong file.
 *
 * Đó đúng là câu mà `harness.mjs` đã tự viết ở chỗ khác: *"một check trả lời 'thiếu' cho thứ
 * đang có thì tệ hơn không có check, vì output của nó trông như một phát hiện."*
 *
 * Nên đây là một máy quét trạng thái, không phải hai cái regex: đi từng ký tự, biết mình đang
 * ở trong chuỗi `'` `"` hay template `` ` `` hay không. **Nội dung chuỗi được GIỮ** — có chủ ý:
 * lệnh mà một thông báo in ra sống trong chuỗi, và đó chính là thứ hợp đồng hai đầu cần soi.
 *
 * CÒN HỞ, và bản trước ghi SAI biến thể: nó đoán hở là *"regex literal chứa `//` hoặc `/*`"*
 * rồi kết luận **"chưa gặp trong repo này"**. Biến thể thật sự cắn là **regex chứa một dấu
 * NHÁY**, và nó đã nằm trong repo suốt: `harness-doctor.mjs:703` có
 * `/['"]\.claude\/hooks(['"\/])/`. Máy quét đọc dấu `'` đó là MỞ CHUỖI, và chuỗi ấy không bao
 * giờ đóng — nên với `blankStrings: true`, **70% `harness-doctor.mjs` bị xoá sạch**, kể cả
 * `process.exit` ở dòng cuối. `native-surface.mjs:92` (`.replace(/'/g, '"')`) mất 86%.
 * Không ai thấy, vì bên gọi chỉ hỏi *"có khớp không"* và câu trả lời KHÔNG-KHỚP đọc như sạch.
 *
 * Nên: nhánh regex ở dưới, và `codeScanDesync()` để không bao giờ phải TIN rằng máy quét còn
 * đồng bộ — một file JS hợp lệ không bao giờ kết thúc khi đang ở trong chuỗi, nên "kết thúc
 * trong chuỗi" là bằng chứng lệch, không phải suy đoán.
 *
 * ĐIỀU KIỆN THOÁT: khi cần đúng hơn thế này thì đừng vá tiếp — dùng một parser thật.
 */

/** Regex hay phép CHIA? Quyết định bằng token ý nghĩa ngay trước dấu `/`. */
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'in', 'of', 'do', 'else', 'delete', 'void', 'yield', 'await', 'new']);

/**
 * Quét từ `s[i] === '/'`. Trả chỉ số ngay sau dấu `/` đóng, hoặc `-1` nếu đây không phải
 * regex. Xuống dòng ⇒ `-1`: regex literal không chứa newline, nên đó là phép chia.
 */
function scanRegexLiteral(s, i) {
  let j = i + 1, inClass = false;
  while (j < s.length) {
    const ch = s[j];
    if (ch === '\\') { j += 2; continue; }
    if (ch === '\n') return -1;
    if (inClass) { if (ch === ']') inClass = false; }
    else if (ch === '[') inClass = true;
    else if (ch === '/') return j + 1;
    j++;
  }
  return -1;
}

/**
 * Một vòng quét, hai câu trả lời: `out` (mã đã lọc) và `openAt` (chỗ chuỗi mở mà không đóng).
 * Tách ra để `codeOnly` và `codeScanDesync` KHÔNG BAO GIỜ là hai máy quét trôi khỏi nhau.
 */
function scanSource(s, blankStrings) {
  let out = '', i = 0;
  let lastSig = '', word = '', lastWord = '';
  const n = s.length;
  const push = (ch) => {
    out += ch;
    if (ch.trim()) lastSig = ch;
    if (/[\w$]/.test(ch)) word += ch;
    else { if (word) lastWord = word; word = ''; }
  };
  // Ngăn xếp template đang mở dở vì đang ở trong `${…}` của nó. Rỗng = `{`/`}` là code
  // bình thường và KHÔNG được đếm — đếm chúng ở mọi nơi thì mỗi khối hàm là một lần lệch.
  const frames = [];
  let mode = 'code', quote = '', strStart = -1, depth = 0;
  // KHÔNG bỏ dòng `#!/usr/bin/env node`. Nhánh regex đọc `/usr/` là một regex và nhả ra
  // NGUYÊN VĂN, nên nó vô hại; còn bỏ dòng đó thì đổi output của 40+ file mà không sửa
  // gì cả. Trong một hàm dùng chung, thay đổi không cần thiết là rủi ro không cần thiết.
  while (i < n) {
    const c = s[i], d = s[i + 1];
    if (mode === 'code') {
      if (c === '/' && d === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; push(' '); continue; }
      if (c === '/' && d === '/') { const e = s.indexOf('\n', i); i = e < 0 ? n : e; continue; }
      if (c === '/') {
        const afterWord = /[\w$]/.test(lastSig);
        const looksRegex = lastSig === ''
          ? true
          : (afterWord ? REGEX_AFTER_WORD.has(word || lastWord) : !')]}'.includes(lastSig));
        if (looksRegex) {
          const end = scanRegexLiteral(s, i);
          // Thân regex đi ra NGUYÊN VĂN — đúng như nhánh mặc định vẫn làm. Nên với
          // `blankStrings: false` output KHÔNG đổi một ký tự; thứ duy nhất đổi là máy quét
          // không còn bị dấu nháy trong regex kéo vào trạng thái "đang ở trong chuỗi".
          if (end > i) { for (let k = i; k < end; k++) push(s[k]); i = end; continue; }
        }
      }
      if (frames.length && c === '{') { depth++; push(c); i++; continue; }
      if (frames.length && c === '}') {
        if (depth === 0) { const f = frames.pop(); push(c); i++; mode = 'str'; quote = f.quote; strStart = f.start; depth = f.depth; continue; }
        depth--; push(c); i++; continue;
      }
      if (c === '"' || c === "'" || c === '`') { mode = 'str'; quote = c; strStart = i; push(c); i++; continue; }
      push(c); i++; continue;
    }
    // ── đang Ở TRONG chuỗi ────────────────────────────────────────────────────
    if (c === '\\') { if (!blankStrings) { push(c); push(s[i + 1] ?? ''); } i += 2; continue; }
    if (quote === '`' && c === '$' && d === '{') {
      // Ruột `${…}` là CODE, không phải văn bản — và đó là chỗ hở thật sự đã cắn:
      // `export.mjs:126` có một template LỒNG trong `${…}`, nên phép quét phẳng đọc dấu
      // backtick MỞ của template trong làm dấu ĐÓNG của template ngoài. Từ đó mọi cặp
      // nháy về sau lệch một nhịp. Giữ ruột `${…}` cũng là ĐÚNG với câu hỏi bên gọi
      // đang hỏi: `${repoPath('')}` là một lời gọi thật, không phải một câu văn.
      push(c); push(d);
      frames.push({ quote, start: strStart, depth });
      depth = 0; mode = 'code'; i += 2; continue;
    }
    // `blankStrings` XOÁ RUỘT chuỗi, chỉ giữ cặp nháy. Mặc định `false` vì bên gọi đầu tiên
    // (hợp đồng hai đầu) CẦN nội dung chuỗi — lệnh mà một thông báo in ra sống trong đó.
    // Bên gọi thứ hai thì ngược lại: một phép kiểm hỏi *"file này có GỌI hàm X không"* mà
    // đọc cả chuỗi sẽ bắn oan vào mọi câu văn nhắc tên hàm. Đo 2026-08-08 (#125): bản đầu
    // của `lib-import` tự viết một `strip()` bằng regex, và nó nuốt **89% `rituals.mjs`** —
    // check báo XANH trên một file nó gần như không đọc được. Chiều B của `L0007`, trong
    // chính cái lưới vừa dựng để bắt chiều A.
    if (c === quote) { push(c); i++; mode = 'code'; quote = ''; strStart = -1; continue; }
    if (!blankStrings) push(c);
    i++;
  }
  // Hết file mà vẫn đang trong chuỗi (hoặc còn `${` chưa đóng) = máy quét ĐÃ LỆCH.
  const openAt = mode === 'str' ? strStart : (frames.length ? frames[0].start : -1);
  return { out, openAt };
}

/** Mã nguồn đã bỏ chú thích. Xem docstring dài của máy quét ngay trên `REGEX_AFTER_WORD`. */
export function codeOnly(src, { blankStrings = false } = {}) {
  return scanSource(String(src), blankStrings === true).out;
}

/**
 * Máy quét có còn đồng bộ không? `null` = có. Ngược lại trả chỗ chuỗi mở mà không đóng.
 *
 * Đây là phép kiểm rẻ nhất mà không cần đoán: file JS hợp lệ không kết thúc giữa một chuỗi.
 * Mọi bên gọi `codeOnly(..., { blankStrings: true })` PHẢI hỏi câu này, vì ở chế độ đó một
 * lần lệch không làm sai kết quả — nó **xoá phần còn lại của file**, và câu trả lời
 * "không tìm thấy" đọc y hệt "không có".
 */
export function codeScanDesync(src) {
  const s = String(src);
  const { openAt } = scanSource(s, false);
  if (openAt < 0) return null;
  return { index: openAt, line: s.slice(0, openAt).split('\n').length, quote: s[openAt] };
}

/**
 * ═══ NHÁNH NÀY VÀO `main` CHƯA — BA TRẠNG THÁI, KHÔNG PHẢI HAI ══════════════
 *
 * `git branch --merged` hỏi *"commit này có phải tổ tiên của main không"*. **Squash-merge tạo
 * một commit MỚI**, nên commit gốc không bao giờ thành tổ tiên — và với phép hỏi đó, một nhánh
 * ĐÃ squash-merge đọc **giống hệt** một nhánh chưa từng có PR.
 *
 * Đo 2026-08-07 (issue #97): PR #89 merge lúc 13:10:45Z → squash `cd450bf`, worktree sạch
 * hoàn toàn, `wt-clean --apply` in *"giữ (chưa merge)"* và không xoá gì. Repo này squash
 * **100%** số PR, nên bộ dò cũ **chưa từng đúng một lần nào** kể từ khi có.
 *
 * Nó lệch về phía "giữ" nên không mất dữ liệu — và đó chính là lý do nó sống lâu mà không ai
 * thấy. Hệ quả thật không phải mất việc, mà là worktree tích lại IM LẶNG và `/wt` không bao
 * giờ đỏ. Một cảnh báo không bao giờ bật thì không phân biệt được với một cảnh báo không có.
 *
 * BÀI HỌC NÀY ĐÃ ĐƯỢC GHI RA MỘT LẦN RỒI. `overlap-scan.mjs:41` có comment nói đúng chuyện
 * này — nhưng nó nằm ở file **không xoá gì cả**, còn file thật sự xoá worktree thì không được
 * áp. Đó là lý do bản vá này là CODE, không phải thêm một comment thứ hai.
 *
 * BA trạng thái, và trạng thái thứ ba là lý do hàm này tồn tại:
 *   · `merged`  — bằng chứng DƯƠNG: git nói tổ tiên, HOẶC GitHub nói có PR đã merge.
 *   · `open`    — hỏi được GitHub, và nó trả về KHÔNG có PR merged nào.
 *   · `unknown` — KHÔNG hỏi được (không `gh`, không mạng, chưa đăng nhập, không phải repo
 *                 GitHub). Đây KHÔNG phải `open`. Gộp nó vào `open` là quay lại đúng bug cũ
 *                 với một câu chữ dễ chịu hơn: *"giữ (chưa merge)"* khẳng định một điều mà
 *                 phép đo không biết. Xem `knowledge/lessons/0005`.
 *
 * THUẦN: cả `mergedSet` lẫn `ask` đều tiêm vào. Không đọc đĩa, không gọi mạng — nên test lái
 * được cả ba nhánh mà không cần dựng repo git hay có `gh` trên máy CI.
 */
export function mergeState(branch, { mergedSet = new Set(), ask = () => ({ status: 1, stderr: 'chưa tiêm `ask`' }) } = {}) {
  if (!branch) return { state: 'unknown', why: 'detached HEAD — không có nhánh để hỏi' };
  if (mergedSet.has(branch)) return { state: 'merged', why: 'git: đã là tổ tiên của origin/main' };
  const r = ask(branch) ?? {};
  if (r.status !== 0) {
    const err = String(r.stderr ?? '');
    const hint = /ENOENT|command not found|not recognized/i.test(err) ? 'không có `gh` trên máy này'
      : /auth|login|credential/i.test(err) ? '`gh` chưa đăng nhập'
      : err.trim().split('\n')[0].slice(0, 80) || 'lỗi không rõ';
    return { state: 'unknown', why: `không hỏi được GitHub (${hint})` };
  }
  let prs;
  try { prs = JSON.parse(r.stdout || '[]'); }
  catch { return { state: 'unknown', why: '`gh` trả về thứ không parse được' }; }
  if (!Array.isArray(prs)) return { state: 'unknown', why: '`gh` trả về thứ không phải mảng' };
  if (!prs.length) return { state: 'open', why: 'GitHub: không có PR nào đã merge cho nhánh này' };
  return { state: 'merged', pr: prs[0].number,
    why: `PR #${prs[0].number} đã merge ${String(prs[0].mergedAt ?? '').slice(0, 10)} — squash, nên git không thấy` };
}

/**
 * Entry đo chi tiêu GẦN NHẤT, hoặc `null` nếu chưa từng đo. Phần IO của `budgetStatus`.
 */
export function latestCapoEntry() {
  return capoEntries('capo-history.json').at(-1) ?? null;
}

/**
 * Sổ đo của gói PHẲNG — **file RIÊNG, không phải hình dạng thứ hai trong mảng cũ** (#180).
 *
 * `latestCapoEntry()` đọc `entries.at(-1)` và mong `{usd, days}`. Nhét một mục `{capoTran}`
 * vào cùng mảng đó là đúng lớp lỗi của #107: một sổ đo lường bị neo vào một mục nó không
 * hiểu. Hai file thì bên đọc cũ **không thể** đọc nhầm — nó không mở file kia.
 */
export function flatCapoEntries() {
  return capoEntries('capo-flat-history.json');
}

function capoEntries(file) {
  const h = readJson(join(stateDir(), file), null);
  return Array.isArray(h?.entries) ? h.entries : [];
}

/**
 * Số đo CAPO-TRẦN gần nhất **còn dùng được**, hoặc `null`. THUẦN — nhận mảng, trả object.
 *
 * `maxAgeDays = 30` **bằng đúng cửa sổ đếm hits** của `budgetSnapshot`, và con số đó không
 * phải khẩu vị: một số đo cũ hơn cửa sổ mô tả một khoảng thời gian **rời hẳn** khoảng đang
 * xét — nó là con số về tháng khác. (Nhánh metered dùng 45 ngày cho `stale` vì trần ở đó là
 * trần THÁNG, không phải một cửa sổ trượt.)
 *
 * Mục giữ NGUYÊN `days` của chính nó thay vì giả định 30: người dùng chạy `--days 7` thì
 * `capoTran` của họ là tỉ lệ trên 7 ngày, và ghép nó cạnh "19 lần / 30 ngày" là trộn hai cửa
 * sổ vào một phân số — `capo-report.mjs` §GÓI PHẲNG từ chối làm đúng chuyện đó.
 */
export function flatCapoReading(entries = [], now = Date.now(), maxAgeDays = 30) {
  const e = Array.isArray(entries) ? entries.at(-1) : null;
  const capoTran = Number(e?.capoTran), days = Number(e?.days), at = Date.parse(e?.at ?? '');
  if (!Number.isFinite(capoTran) || capoTran < 0) return null;
  if (!Number.isFinite(days) || days <= 0 || !Number.isFinite(at)) return null;
  const ageDays = Math.round((now - at) / 86400000);
  if (ageDays > maxAgeDays || ageDays < 0) return null;
  return { capoTran, days, ageDays, hits: Number(e?.hits), accepted: Number(e?.accepted) };
}

/**
 * ═══ HAI ĐẦU MỘT KÊNH, MỘT DANH SÁCH ════════════════════════════════════════
 *
 * Mọi field `upstream.mjs` ghi vào `pack.json` phải khai ở đây KÈM BÊN ĐỌC.
 * `test-hooks.mjs` đọc mã nguồn `upstream.mjs`, lấy tập key nó ghi, và bắt buộc
 * bằng đúng tập key ở đây — thêm field mà không nói ai đọc thì test ĐỎ.
 *
 * VÌ SAO PHẢI LÀ TEST, KHÔNG PHẢI TÀI LIỆU. Đây là bất biến GIỮA HAI FILE, không
 * phải tính chất của một file — không lint rule nào biểu diễn được. Và "nhớ cập nhật
 * cả hai đầu" dưới dạng comment là đúng thứ ĐÃ THẤT BẠI: comment ở `upstream.mjs:150`
 * ghi rõ tác giả BIẾT fixlog mới là payload có giá trị, rồi vẫn xây đúng một nửa kênh.
 *
 * ĐO 2026-08-07 trên `main` — trước bản vá này, BỐN field không có bên đọc nào,
 * cộng hai payload trên đĩa:
 *
 *     direction · evals · artifacts · mechanismDiffs   +  fixlog.md  +  mechanism-diffs/
 *
 * (Issue #61 nói `fixlogEntries` không ai đọc — SAI: `consumers.mjs:56` đọc nó. Và nó bỏ
 * sót `mechanismDiffs`, cái nặng hơn. Cả hai nhầm lẫn đến từ cùng một chỗ: grep một tên
 * field rồi đọc con số, thay vì đối chiếu HAI ĐẦU. Đó chính là việc bảng này làm thay.)
 *
 * `fixlog.md` là nặng nhất: retro đo 20 mục fixlog thô qua 3 repo, và
 * `accept.mjs --list` đọc ra là *"Không có gì trong knowledge/incoming/"* — vì nó chỉ
 * nhìn `lessons/`. `mechanism-diffs/` cũng vậy: `upstream.mjs` sinh file `.diff` thật
 * rồi không cơ chế nào mở chúng ra.
 *
 * KHÔNG cho phép giá trị `null` ở bảng này — cố ý. Một ô "chưa ai đọc, sẽ tính sau"
 * là chỗ orphan tiếp theo trốn vào, và nó sẽ trốn được vô hạn vì test vẫn xanh.
 */
export const PACK_SCHEMA = {
  pack: 'accept.mjs — tên thư mục trong knowledge/incoming/, dùng làm `ref`',
  direction: 'accept.mjs --list — nhãn ↑ đi lên / ↓ đi xuống',
  sourceProject: 'consumers.mjs (sổ) · accept.mjs (provenance `seen-in`)',
  sourcePath: 'upstream.mjs:208 — hai repo KHÁC nhau cùng `project.id` sẽ ghi đè pack của nhau',
  sourceCommit: 'packPending() — neo "đã quyết" · accept.mjs originTag · consumers.mjs',
  sourceHarnessVersion: 'consumers.mjs — độ lệch version so với template',
  exportedAt: 'consumers.mjs — bao lâu rồi repo đó không gửi lên',
  fixlogEntries: 'accept.mjs --list · consumers.mjs',
  lessons: 'accept.mjs --list · consumers.mjs',
  evals: 'accept.mjs --list',
  artifacts: 'accept.mjs --list',
  mechanismDiffs: 'accept.mjs --list',
};

/**
 * Pack này MANG GÌ — đếm mọi loại nguyên liệu, không chỉ bài học.
 *
 * Hàm THUẦN. `total` là thứ trả lời câu *"mở pack này ra có gì để đọc không?"*, và nó
 * phải khác `lessons.length` — nếu không thì một pack 20 mục fixlog vẫn đọc ra là rỗng.
 */
export function packMaterial(pack = {}) {
  const n = (v) => (Array.isArray(v) ? v.length : Number.isInteger(v) && v > 0 ? v : 0);
  const parts = {
    lessons: n(pack.lessons),
    fixlogEntries: n(pack.fixlogEntries),
    mechanismDiffs: n(pack.mechanismDiffs),
    evals: n(pack.evals),
    artifacts: n(pack.artifacts),
  };
  return { ...parts, total: Object.values(parts).reduce((a, b) => a + b, 0) };
}

/**
 * MỘT định nghĩa "pack đang chờ quyết", cho cả ba nơi hỏi câu đó.
 *
 * Trước bản vá này có BA mẫu số cho một câu hỏi:
 *   · `harness-doctor`  — pack có THƯ MỤC `lessons/` tồn tại
 *   · `accept.mjs`      — có FILE `.md` bên trong `lessons/`
 *   · `rituals.mjs`     — `sourceCommit` chưa nằm trong `DECISIONS.log`
 *
 * Một pack có `lessons/` RỖNG (đúng cấu hình retro đo được: `"lessons": []` ở cả ba pack)
 * ⇒ doctor đếm 1, accept đếm 0. Đó là lý do doctor nói *"3 pack chờ duyệt — quyết đi"*
 * trong khi `accept.mjs --list` nói *"Không có gì"*, và người tin cái nói không-có-gì.
 *
 * Neo thắng cuộc là `sourceCommit`: pack là SNAPSHOT (`upstream --apply` sinh lại mỗi lần
 * chạy), nên đếm sự TỒN TẠI thì mục đỏ lại vĩnh viễn sau khi đã quyết. Commit của repo gửi
 * không đổi thì "đã quyết" là trạng thái bền; repo đó có nguyên liệu mới ⇒ commit mới ⇒
 * đỏ lại, và lần đó thì ĐÚNG.
 *
 * Hàm THUẦN: nhận danh sách pack đã đọc + nội dung sổ, không chạm đĩa.
 */
export function packPending(packs = [], decisionsLog = '') {
  const log = String(decisionsLog || '');
  // Không đọc được commit ⇒ coi là CHƯA quyết. Thà nhắc thừa còn hơn im lặng bỏ qua
  // nguyên liệu đi lên — chiều LÊN là chiều dễ tắt nhất của vòng học, vì im lặng là
  // trạng thái bình thường của nó và không ai đi điều tra một mục không kêu.
  const pending = packs.filter(p => !p?.sourceCommit || !log.includes(p.sourceCommit));
  return {
    pending,
    count: pending.length,
    material: pending.reduce((t, p) => t + packMaterial(p).total, 0),
  };
}

/**
 * ĐỌC mọi pack trong `knowledge/incoming/` — phần IO của `packPending`, tách ra để phán
 * đoán ở trên vẫn test được mà không cần dựng thư mục thật.
 *
 * Trả `null` (KHÔNG phải `[]`) khi không đọc được thư mục: "không đo được" và "không có
 * pack nào" là hai trạng thái khác nhau, và gộp chúng là cách một mục tới hạn thật biến
 * thành một dòng xanh.
 */
export function readPacks(dir = repoPath('knowledge', 'incoming')) {
  if (!exists(dir)) return [];
  let names;
  try { names = readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); }
  catch { return null; }
  return names.map(name => ({ name, ...(readJson(join(dir, name, 'pack.json')) || {}) }));
}

/**
 * ĐO email tác giả DISTINCT — bằng chứng cho câu hỏi `teamSize` của `setup.mjs`.
 *
 * ĐÂY LÀ CẬN TRÊN, KHÔNG PHẢI SỐ NGƯỜI. Nói rõ vì đây là chỗ dễ tự lừa mình nhất: một
 * người dùng hai email đếm ra HAI. Đo trên chính repo này 2026-08-06 — 2 email, 1 người:
 *
 *     136480142+thiengthb@users.noreply.github.com   ← commit merge qua web GitHub
 *     tranngocthien628@gmail.com                     ← commit từ máy
 *
 * Không cố gộp bằng heuristic. Không có phép nối nào đúng giữa `thiengthb` và một địa chỉ
 * gmail, và một phép đoán sai ở đây ghi thẳng vào `harness.config.json`. Hàm này TRẢ VỀ
 * DANH SÁCH để người nhìn thấy và tự sửa số — `setup.mjs` in nguyên nó ra.
 *
 * KHÔNG lọc `users.noreply.github.com`: đó là địa chỉ của NGƯỜI THẬT giấu email. Chỉ lọc
 * bot thật (`*[bot]@*`, `actions@github.com`, `noreply@<vendor>`) — Co-Authored-By của
 * agent không phải một đồng đội, và nó không nằm ở `%ae` nên cũng không lọt vào đây.
 *
 * Trả về `null` khi không đọc được lịch sử. `null` ≠ 1: repo chưa có commit nào KHÔNG phải
 * bằng chứng của solo, nó là KHÔNG CÓ bằng chứng.
 */
const BOT_AUTHOR = /\[bot\]@|^actions@github\.com$|^noreply@/;
export function commitAuthors(maxCommits = 500) {
  const r = git(['log', `-${maxCommits}`, '--format=%ae']);
  if (r.status !== 0) return null;
  const emails = r.stdout.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean)
    .filter(e => !BOT_AUTHOR.test(e));
  return emails.length ? [...new Set(emails)] : null;
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
    // BẮT BUỘC khi stdio là 'pipe'. Mặc định của Node là 1 MiB, và vượt ngưỡng thì nó KHÔNG
    // truncate — nó GIẾT tiến trình con (SIGTERM), trả `status: null` + `error.code = 'ENOBUFS'`.
    // `stdio: 'inherit'` ở nhánh mặc định che ca này, nên bug chỉ nổ ở lời gọi `capture: true`,
    // tức đúng những gate in nhiều nhất.
    //
    // Đo trên một project đã áp template (2026-08-10): gate `e2e` pipe cả log dev server, tổng
    // output dao động quanh ĐÚNG 1 MiB, nên cùng một commit lúc XANH lúc ĐỎ — 4 lần OK / 2 lần
    // FAIL trên cùng base. Report Playwright của đúng lần "FAIL" cho 28/28 test PASS: gate nói
    // đỏ trong khi bộ test nói xanh.
    maxBuffer: MAX_BUFFER,
  });

  // `status === null` KHÔNG BAO GIỜ nghĩa là "lệnh trả mã lỗi": tiến trình bị giết bằng signal
  // (buffer, OOM, timeout) hoặc spawn thất bại. Gộp nó vào `r.status ?? 1` là biến một sự cố HẠ
  // TẦNG thành một cái đỏ y hệt test đỏ — người đọc CI đi tìm bug trong test của mình, chỗ không
  // có gì sai. Đây là cùng lớp lỗi mà cả `gen-clean` lẫn `runGate` đã phải sửa: MÀU đúng chưa đủ,
  // CHẨN ĐOÁN phải đúng. `gates.mjs` in `r.detail` nếu có, nên nói thẳng ra ở đây.
  if (r.status === null) {
    const why = r.error
      ? `${r.error.code ?? r.error.name}: ${r.error.message}`
      : `bị giết bởi signal ${r.signal}`;
    return {
      skipped: false,
      status: 1,
      stdout: r.stdout ?? '',
      stderr: r.stderr ?? '',
      signal: r.signal ?? null,
      error: r.error ?? null,
      detail:
        `KHÔNG PHẢI lệnh trả mã lỗi — tiến trình không thoát bình thường (${why}). `
        + `Đây là sự cố hạ tầng của lần chạy, đừng đi tìm bug trong \`${name}\`: kiểm bộ nhớ, `
        + `timeout, và lượng output mà lệnh in ra.`,
    };
  }

  return {
    skipped: false,
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    signal: null,
    error: null,
  };
}

/**
 * Chạy lệnh dạng mảng args.
 *
 * `shell` mặc định `IS_WIN` vì Windows cần shell để resolve **`.cmd`/`.ps1` shim**
 * của package manager (`npm`, `pnpm`, `yarn` là shim, không phải .exe).
 *
 * NHƯNG `shell: true` LÀ MỘT CÁI BẪY, và nó chỉ nổ trên MỘT hệ điều hành:
 * Node **nối args thành chuỗi mà KHÔNG escape** (chính Node cảnh báo — DEP0190).
 * Nên một arg có dấu cách bị chẻ thành nhiều arg:
 *
 *   git commit-tree <sha> -m "fixture: migration da merge"
 *     shell:false → 1 tree  ✓
 *     shell:true  → git thấy `migration` `da` `merge` là 3 tree nữa
 *                 → "fatal: must give exactly one tree"
 *
 * Lớp lỗi này XANH trên Linux/macOS và ĐỎ trên Windows — đúng loại lỗi mà Parity
 * Contract tồn tại để bắt, và nó đã ẩn trong fixture của `test-hooks.mjs` từ v1.3.0
 * (bắt được ở CI `parity (windows-latest)`, xem HARNESS-CHANGELOG 1.6.0).
 */
/**
 * `env` là THÊM VÀO `process.env`, không thay thế nó — denylist, không allowlist. Một
 * allowlist ở đây từng làm rớt `PATHEXT` và giết mọi lần chạy trên Windows (xem
 * HARNESS-CHANGELOG 1.6.0). Bỏ qua `env` mà cứ nhận tham số là chế độ hỏng tệ hơn: nơi gọi
 * tin rằng biến đã được đặt — và một cờ chống-lặp không được đặt thì thành vòng lặp vô hạn.
 */
export function run(bin, args = [], { cwd = REPO_ROOT, capture = true, input, shell = IS_WIN, env } = {}) {
  const r = spawnSync(bin, args, {
    cwd, encoding: 'utf8', input, shell,
    // Cùng lớp lỗi `runConfigured` vừa sửa ở v2.75.0 — nhưng ở TẦNG DƯỚI nó. `run()` là thứ
    // `git()` đi qua, nên mọi phép đo git của harness đều đang chịu trần 1 MiB của Node, và
    // vượt ngưỡng thì Node GIẾT tiến trình con chứ không cắt bớt.
    //
    // Tái hiện 2026-08-13 — `run('node', ['-e', 'process.stdout.write("x".repeat(N))'])`:
    //   500 KiB → status 0, nhận đủ 512 000 byte
    //   2 MiB   → status 1, nhận 1 059 776 byte      ← tiến trình con exit 0 ở CẢ HAI ca
    //
    // Ngòi nổ hiện thực: `git status --porcelain` ≈ 45 byte/dòng ⇒ vỡ ở ~23 300 file bẩn. Một
    // repo tiêu thụ quên gitignore `node_modules` là quá đủ — đo trên máy này: 57 737 file
    // (`sakubun`), 35 709 (`warehouse`). Khi đó `dirtyFiles` ở `collect()` thành `null` và
    // `/handoff` ra `?` kèm lý do *"không đọc được cây làm việc"*: đúng triệu chứng, sai
    // nguyên nhân — git không hỏng, cái trần này mới hỏng.
    maxBuffer: MAX_BUFFER,
    ...(env ? { env: { ...process.env, ...env } } : {}),
    stdio: capture ? 'pipe' : 'inherit',
  });
  // `status === null` KHÔNG BAO GIỜ nghĩa là "lệnh trả mã lỗi" — tiến trình bị giết bằng signal
  // (buffer, OOM, timeout) hoặc spawn thất bại. `r.status ?? 1` gộp hai chuyện đó vào cùng một
  // số `1`, và từ đó không bên gọi nào phân biệt được nữa.
  //
  // Giữ `status: 1` để FAIL-ĐÓNG — một lệnh bị cắt cụt không được đọc thành thành công. Nhưng
  // nói ra ở `detail`. Ba trường thêm là PHỤ: hợp đồng cũ `{status, stdout, stderr}` không đổi,
  // nên 60+ nơi gọi không phải sửa gì.
  if (r.status === null) {
    const why = r.error ? `${r.error.code ?? r.error.name}: ${r.error.message}` : `bị giết bởi signal ${r.signal}`;
    return {
      status: 1,
      stdout: (r.stdout ?? '').trim(),
      stderr: (r.stderr ?? '').trim(),
      signal: r.signal ?? null,
      error: r.error ?? null,
      detail: `KHÔNG PHẢI lệnh trả mã lỗi — \`${bin}\` không thoát bình thường (${why}). `
        + 'Đây là sự cố hạ tầng của lần chạy: kiểm lượng output lệnh in ra, bộ nhớ, và timeout.',
    };
  }
  return { status: r.status, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim(), signal: null, error: null, detail: null };
}

/**
 * `shell: false` LUÔN LUÔN, kể cả trên Windows — `git` là `git.exe`, một executable
 * thật, không phải shim, nên nó không cần shell. Và đi qua shell thì mọi arg có dấu
 * cách (message commit, đường dẫn có khoảng trắng — `C:\Users\Nguyen Van A\...`) bị
 * chẻ im lặng. Đây là chỗ DUY NHẤT trong harness quyết định điều đó; 40+ lệnh git
 * trong repo thừa hưởng.
 */
export function git(args, opts = {}) {
  return run('git', args, { ...opts, shell: false });
}

/** Nhánh hiện tại, hoặc '' nếu không ở trong git repo. */
export function currentBranch() {
  const r = git(['branch', '--show-current']);
  return r.status === 0 ? r.stdout : '';
}

/**
 * Cây này là worktree hay cây chính? → { known, isWorktree, commonDir, mainRoot }
 *
 * ĐẶT Ở ĐÂY, không để mỗi công cụ tự suy ra. Trạng thái BÌNH THƯỜNG của một phiên
 * harness là ở TRONG worktree — `/claim` bắt buộc "một issue = một nhánh = một
 * worktree". Nhưng mọi công cụ đo đều đo *cây hiện tại*, và trong worktree:
 *   · `worktree.sparsePaths` làm file vắng mặt HỢP LỆ → "harness đang co" là sai
 *   · reservation của người khác nằm trên NHÁNH của họ → "không chồng lấn" là sai
 * Để năm công cụ tự suy ra thì cả năm đều sai, và cái thứ năm sai vào đúng ngày
 * cơ chế worktree được ship.
 */
export function worktreeInfo() {
  const common = git(['rev-parse', '--git-common-dir']).stdout;
  const gitDir = git(['rev-parse', '--git-dir']).stdout;
  if (!common || !gitDir) return { known: false, isWorktree: false, mainRoot: REPO_ROOT };
  const isWorktree = resolve(REPO_ROOT, common) !== resolve(REPO_ROOT, gitDir);
  return {
    known: true,
    isWorktree,
    commonDir: common,
    mainRoot: isWorktree ? dirname(resolve(REPO_ROOT, common)) : REPO_ROOT,
  };
}

/**
 * Mọi báo cáo phải NÓI RA nó đang đo cây nào. Một con số không nói mình đo ở đâu
 * là một con số sẽ bị so với con số đo ở chỗ khác.
 */
export function reportScope() {
  const wt = worktreeInfo();
  if (!wt.isWorktree) return null;
  return `⚠ đang đo trong WORKTREE (cây chính: ${wt.mainRoot}). File có thể vắng mặt HỢP LỆ `
       + `do sparsePaths hoặc do nằm trên nhánh khác — đừng so số này với mốc lấy ở cây chính.`;
}

/**
 * Phiên này có người ngồi xem không?
 *
 * Ba giả định đã hết hạn: background agent tự commit + push + mở draft PR;
 * scheduled task và webhook mở session không ai đọc. Dùng ở ba chỗ:
 *   · gates.mjs  — phiên không người thì KHÔNG fail-open, kể cả khi gate bị BỎ QUA
 *   · budget     — nâng mức cảnh báo, vì không ai thấy để dừng tay
 *   · session-start — đừng in nghi thức cho phiên không có người đọc
 *
 * KHÔNG DÙNG `!process.stdout.isTTY`. Đây là cái bẫy: hook LUÔN được spawn với
 * stdio piped, nên isTTY là false ở MỌI phiên bình thường — kể cả phiên có người
 * đang ngồi nhìn. Một `unattended()` dựa vào isTTY sẽ báo "không có người" cho cả
 * team, mọi lúc, và mọi thứ fail-đóng dựng trên nó thành một guard bắn nhầm.
 * Xem knowledge/lessons/0002-guard-ban-nham.md — đây đúng là lớp lỗi đó.
 * Chỉ ba tín hiệu dưới đây là đọc được TỪ BÊN TRONG một hook.
 *
 * ĐIỀU KIỆN THOÁT: khi vendor phơi ra một cờ chính thức cho phiên không người.
 */
export const unattended = () =>
  !!process.env.CI
  || process.env.CLAUDE_CODE_UNATTENDED === '1'
  || process.env.CLAUDE_CODE_ENTRYPOINT === 'sdk-cli';

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

/**
 * Chặn tool call và giải thích CÁCH SỬA (không chỉ nói sai).
 *
 * ── GHI SỔ LÀ VIỆC CỦA `block()`, KHÔNG PHẢI CỦA CHỖ GỌI
 *
 * Trước 2.17.0, mỗi hook tự nhớ gọi `telemetry('gate-fails', …)` ngay trước `block()`.
 * Quét 2026-08-06: **8/9 nhớ, 1 quên** — `protect-feature-files.mjs` nhánh
 * `features/_index.json`, tức gác single-writer của DRI. Nhánh còn lại của CHÍNH file đó thì
 * nhớ. Nên đây không phải quy ước chưa tồn tại; nó tồn tại và trượt đúng một chỗ.
 *
 * Hậu quả KHÔNG phải "thiếu một dòng log". Một gác chặn mà im thì:
 *   · `harness-doctor` đọc là `? chưa đo`,
 *   · `/harness-retro` bước 4 — chỗ BẮT BUỘC đề xuất cắt bỏ — đọc là gác chưa bắt được gì.
 * Tức **gác càng đúng mà càng im thì càng dễ bị cắt**: chọn lọc ngược, và nạn nhân là những
 * cái gác đang lặng lẽ làm việc.
 *
 * Sửa ở ĐÂY thay vì sửa từng hook, vì đây là chỗ duy nhất khiến việc đó KHÔNG THỂ quên nữa.
 * Một ratchet đếm số chỗ trượt của một quy ước chỉ là giải pháp tạm cho việc quy ước ấy chưa
 * được cưỡng chế tại nguồn.
 *
 * KHÔNG đếm hai lần: chỗ gọi nào đã tự ghi `gate-fails` (8/9 hook hiện tại, kèm chi tiết mà
 * chỉ nó biết — issue nào, nhánh nào) thì `block()` im. Bộ đếm phải giữ nguyên nghĩa, nếu
 * không thì bản vá này lại làm hỏng chính con số nó sinh ra để cứu.
 */
export function block(message, howToFix) {
  if (!gateFailLogged) telemetry('gate-fails', [hookSelfName(), String(message).slice(0, 160)]);
  console.error(`⛔ BỊ CHẶN: ${message}`);
  if (howToFix) console.error(`   → ${howToFix}`);
  process.exit(EXIT_BLOCK);
}

/**
 * Tên hook đang chạy, suy từ đường dẫn script. Hook luôn được spawn dưới dạng script nên
 * `argv[1]` là nguồn tin cậy; không có thì trả `'(hook)'` chứ KHÔNG đoán — một cái tên bịa
 * trong sổ còn tệ hơn không có tên, vì nó gộp nhầm hai gác khi đếm.
 */
function hookSelfName() {
  try {
    const b = String(process.argv[1] || '').split(/[\\/]/).pop() || '';
    return b.replace(/\.mjs$/, '') || '(hook)';
  } catch { return '(hook)'; }
}

export function pass() {
  process.exit(EXIT_OK);
}

/**
 * Khai báo hook này làm gì khi LOGIC CỦA CHÍNH NÓ ném lỗi — và biến việc đó thành một
 * LỰA CHỌN CÓ VIẾT RA, không phải một tai nạn.
 *
 * ── VÌ SAO FILE NÀY CẦN NÓ. ĐO ĐƯỢC, KHÔNG PHẢI PHÒNG XA.
 *
 * Một ngoại lệ ở bất cứ đâu trong hook làm tiến trình kết thúc với mã 1, và Claude Code
 * đọc mọi mã KHÁC 0 và 2 là "lỗi không chặn" ⇒ tool call **ĐI QUA**. Tức là một cái gác
 * mà regex của nó ném lỗi thì không chặn — nó CHO PHÉP, im lặng.
 *
 * Đo trên harness ngày 2026-08-05 bằng cách tiêm lỗi ngay sau `import`, trước mọi phép
 * kiểm, rồi đưa vào đúng payload mà hook phải chặn:
 *
 *     hook                 input                              sạch     ném lỗi
 *     block-secrets        `sk-ant-…` thật vào config.ts       exit=2   exit=1  ⇒ LỌT
 *     dcg                  `git push --force origin main`      exit=2   exit=1  ⇒ LỌT
 *     dcg                  `rm -rf /`                          exit=2   exit=1  ⇒ LỌT
 *     protect-harness      ghi `.claude/settings.json`         exit=2   exit=1  ⇒ LỌT
 *
 * CẢ BỐN cái gác của ba nhóm nguy hiểm (`.claude/rules/danger-zones.md`) đều fail-OPEN.
 * Và nó im lặng theo một cách riêng: `hookRan()` nằm ở CUỐI hook nên crash không ghi gì,
 * và `harness-doctor` đếm 0 — đọc y hệt *"cái gác này chạy suốt mà chưa bắt gì"*. Ba
 * tình huống gộp thành một: gác đang làm việc · gác không được cắm · gác đang crash.
 *
 * Cơ chế này lấy từ `fleet/.claude/hooks/_util.mjs` (`declareFailMode`), nơi nó sinh ra
 * từ cùng một thí nghiệm trên `secret-guard` ngày 2026-07-31. Phát biểu ngoài của cùng
 * luật: *"For a protection hook, an error should mean block, not allow."*
 *
 * ── NHƯNG KHÔNG PHẢI HOOK NÀO CŨNG NÊN FAIL-CLOSED. Đây là phần một bản sửa đồng loạt
 * làm sai. Chặn-khi-lỗi chỉ đúng ở nơi hook cưỡng chế một BẤT BIẾN CỨNG. Với hook CỐ VẤN
 * thì exit 1 vốn đã là kết quả đúng — tool call đi qua VÀ lỗi hiện ra trong transcript.
 * Ép chúng về 0 còn tệ hơn không làm gì: crash trở thành vô hình.
 *
 * @param {0|1|2} code  2 = fail CLOSED (chặn; CHỈ cho bất biến cứng)
 *                      1 = fail OPEN nhưng HIỆN RA (cố vấn — mặc định đúng cho hầu hết)
 *                      0 = fail open và IM LẶNG (gần như không bao giờ đúng)
 * @param {string} why  một câu ngắn, nói THỨ GÌ không kiểm được — hiện ra cho Claude đọc
 */
export function declareFailMode(code, why) {
  const name = (process.argv[1] || '').split(/[\\/]/).pop()?.replace(/\.mjs$/, '') || 'hook';
  const bail = (err) => {
    const msg = String(err?.message || err || 'không rõ').split('\n')[0].slice(0, 200);
    // Ghi crash NGAY, trước khi thoát. Không ghi thì tầng đếm đọc crash thành "chưa bắt gì".
    try { hookRan(name, 'crash', msg); } catch { /* kế toán không bao giờ là lý do hook chết */ }

    // ĐƯỜNG THOÁT ĐƯỢC KHAI BÁO, và nó có lý do. Mọi hook đều import module này, nên một
    // lỗi Ở ĐÂY (config lỗi cú pháp là ca thực tế nhất) làm MỌI hook fail-closed cùng lúc
    // và repo thành không dùng được. Một lỗ hổng được khai báo thì cãi lại được; một vụ
    // khoá cứng im lặng thì chỉ còn cách đi tìm trong mã nguồn lúc đang gấp.
    const escape = /^(1|true|yes)$/i.test(String(process.env.HARNESS_FAIL_OPEN || ''));
    const effective = escape ? 1 : code;
    if (escape) telemetry('harness-edits', [name, 'HARNESS_FAIL_OPEN', msg]);

    const mode = effective === 2 ? 'FAIL-CLOSED, đang chặn'
      : effective === 1 ? 'fail-open, có báo' : 'fail-open, im lặng';
    console.error(`${name}: không kiểm được — ${msg}`);
    console.error(`   ${why} [${mode}: exit ${effective}]`);
    if (effective === 2) {
      console.error('   Đây là gác bất biến cứng nên lỗi = CHẶN, không phải cho qua.');
      console.error('   Nếu chính cái gác đang hỏng và bạn cần đi tiếp: HARNESS_FAIL_OPEN=1 (sẽ được ghi log).');
    }
    process.exit(effective);
  };
  // BẮT CẢ HAI. `await` ở cấp cao nhất biến một hook ném lỗi thành unhandled REJECTION chứ
  // không phải uncaught exception — chỉ bắt loại sau thì mọi hook có `await` vẫn fail-open.
  process.on('uncaughtException', bail);
  process.on('unhandledRejection', bail);
}

/**
 * Rút file_path từ mọi biến thể tool input (Write/Edit/NotebookEdit).
 *
 * FALLBACK `input.file_path` LÀ BẮT BUỘC, KHÔNG PHẢI PHÒNG XA: các sự kiện vòng đời
 * KHÔNG có `tool_input` — chúng gửi path ở CẤP TRÊN. `ConfigChange` gửi
 * `{ source, file_path }`; `InstructionsLoaded` gửi `{ file_path, memory_type, … }`.
 * Không có dòng này thì cắm `protect-harness.mjs` vào `ConfigChange` cho path RỖNG,
 * hook `pass()` ngay, và lớp phòng thủ thứ hai là trang trí — im lặng, đúng kiểu
 * hỏng tệ nhất. Sửa ở MỘT chỗ để mọi hook thừa hưởng, thay vì trong từng hook.
 */
export function toolFilePath(input) {
  const ti = input?.tool_input ?? {};
  return ti.file_path ?? ti.path ?? ti.notebook_path ?? input?.file_path ?? '';
}

export function toolCommand(input) {
  return String(input?.tool_input?.command ?? '');
}

/**
 * ═══ KHỚP LỆNH, KHÔNG KHỚP CHUỖI ════════════════════════════════════════════
 *
 * `dcg.mjs` nhận một CHUỖI và xử lý nó như một LỆNH. Hai triệu chứng ngược nhau, một gốc:
 *
 *   CHẶN NHẦM VĂN BẢN — 5 lần đo được, gồm cả lần chặn chính lệnh `gh issue create` mở
 *   issue #43, vì thân issue trích tên lệnh. Guard chặn được cả việc BÁO CÁO về chính nó.
 *
 *   CHO QUA LỆNH THẬT — 5/5 biến thể nguỵ trang bằng nháy đi lọt, trong khi shell thực thi
 *   chúng y hệt dạng bị chặn. (Claude Code 2.1.223 vừa vá đúng lớp lỗi này ở tầng vendor.)
 *
 * MÔ HÌNH ĐÚNG: một rule về `git push --force` là rule về **chương trình `git`**. Khi
 * chương trình là `gh` hay `node`, cùng chuỗi đó là ĐỐI SỐ VĂN BẢN, không phải lệnh.
 *
 * BA BƯỚC, và mỗi bước xử đúng một phần:
 *   1. `stripHeredocs` — thân heredoc là DỮ LIỆU. Ba trong năm ca chặn nhầm là heredoc.
 *   2. `simpleCommands` — cắt theo `; && || |` và xuống dòng, lấy token đầu làm chương trình.
 *   3. `unquote` — bỏ nháy TRONG một lệnh đã xác định chương trình, để `git "push" --force`
 *      và `git push --fo""rce` quy về cùng một dạng.
 *
 * ĐÂY LÀ BEST-EFFORT, VÀ PHẢI ĐƯỢC ĐỌC NHƯ VẬY. Nó KHÔNG bắt được:
 *   · biến shell (`F=--force; git push $F`) — cần thực thi mới biết giá trị;
 *   · `eval`, command substitution, `base64 -d | sh`;
 *   · bất cứ gì ngoài ngữ pháp shell đơn giản.
 * Tầng MỘT là `settings.json → permissions.deny`, do vendor cưỡng chế. `dcg` là tầng HAI:
 * giải thích + telemetry + phủ những nhóm deny chưa với tới. Xem `.claude/rules/danger-zones.md`.
 */
export function stripHeredocs(cmd) {
  // `<<EOF`, `<<-EOF`, `<<'EOF'`, `<<"EOF"` — thân tới dòng chỉ chứa nhãn thì dừng.
  const lines = String(cmd).split('\n');
  const out = [];
  let end = null;
  for (const line of lines) {
    if (end !== null) {
      if (line.trim() === end) end = null;
      continue;                                  // thân heredoc: DỮ LIỆU, không quét
    }
    const m = line.match(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/);
    out.push(line);
    if (m) end = m[2];
  }
  return out.join('\n');
}

/** Bỏ nháy để `git "push" --force` và `git push --fo""rce` quy về một dạng. */
export function unquote(s) {
  return String(s).replace(/(["'])(.*?)\1/gs, '$2');
}

/**
 * Cắt một dòng lệnh thành các LỆNH ĐƠN, mỗi cái có chương trình của nó.
 *
 * Bỏ qua tiền tố gán biến (`FOO=1 git push`) và các bọc thường gặp (`sudo`, `env`, `time`,
 * `xargs`) để token đầu là chương trình THẬT — nếu không, `sudo rm -rf /` có chương trình
 * là `sudo` và mọi rule về `rm` đều trượt.
 */
const CMD_WRAPPERS = new Set(['sudo', 'env', 'time', 'nohup', 'command', 'exec', 'xargs', 'nice', 'doas']);

/**
 * `splitNewlines: false` — GIỮ đối số NHIỀU DÒNG nguyên vẹn. Mặc định là `true` vì mọi rule
 * hiện có đều muốn "mỗi dòng một lệnh".
 *
 * VÌ SAO CÓ CỜ NÀY (#177, đo 2026-08-12 — bằng cách chính guard đó để lọt một lệnh của tôi):
 * `\n` trong danh sách cắt xé một đối số nhiều dòng thành nhiều mảnh, và mảnh mang backtick
 * KHÔNG còn `program` là `node`:
 *
 *     node -e "        → program=node,   không backtick
 *     const s = `a`    → program=const,  CÓ backtick        ← gate chương trình trượt ở đây
 *
 * Nên rule backtick trượt đúng ca nó sinh ra để bắt — *văn bản NHIỀU DÒNG qua `node -e`*. Bảy
 * lần đã đo đều là văn bản nhiều dòng; bộ ca test thì toàn một dòng, nên nó xanh suốt.
 *
 * KHÔNG sửa mặc định: phép cắt theo `\n` là nền của #43 (khớp LỆNH thay vì khớp CHUỖI), và
 * đổi nó là đổi hành vi của cả 12 rule để chữa một rule.
 */
export function simpleCommands(cmd, { splitNewlines = true } = {}) {
  return stripHeredocs(cmd)
    .split(splitNewlines ? /\n|;|&&|\|\||\||&(?!&)/ : /;|&&|\|\||\||&(?!&)/)
    .map(part => {
      const bare = unquote(part).trim();
      if (!bare) return null;
      const tokens = bare.split(/\s+/);
      let i = 0;
      while (i < tokens.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]) || CMD_WRAPPERS.has(tokens[i].replace(/^.*[/\\]/, '')))) i++;
      if (i >= tokens.length) return null;
      const program = tokens[i].replace(/^.*[/\\]/, '');   // `/usr/bin/git` → `git`
      return { program, text: tokens.slice(i).join(' '), raw: part.trim() };
    })
    .filter(Boolean);
}

/**
 * Agent KHÔNG CHẠY vì hạ tầng, chứ không phải agent làm sai — issue #93.
 *
 * THUẦN. Trả tên nguyên nhân, hoặc `null`.
 *
 * VÌ SAO TỒN TẠI. Đo 2026-08-07, lần đầu `evals.command` được lấp và chạy thật: ba trong bốn
 * task trả về sau **0.1 phút** (task chạy thật mất 3.9p), transcript của cả ba là
 *
 *     You've hit your session limit · resets 12am (Asia/Saigon)
 *
 * Agent chưa từng chạy. Nhưng `runAgent()` trả một object, `Boolean(agent)` là `true`, nên
 * `measured` là `true`, và assertion tất định — chạy trên một cây KHÔNG CÓ GÌ XẢY RA — fail.
 * Báo cáo in `REGRESSION 25% (1/4)`.
 *
 * **Một phép đo KHÔNG XẢY RA được ghi thành một phép đo THẤT BẠI**, và con số đổ về phía
 * *"harness của bạn chỉ bảo vệ được 25%"* — tức đúng hướng khiến người đọc đi CẮT những lớp
 * đang làm việc. `L0005` ở chiều tệ nhất, và ở lớp đắt nhất.
 *
 * `run.mjs` đã có ba trạng thái và một mẫu số loại `n/a` ra — thiếu đúng phép nhận diện này.
 *
 * KHỚP RỘNG CÓ CHỦ Ý. Cái giá của một `?` nhầm là một dòng "chưa đo được"; cái giá của một
 * `FAIL` nhầm là một kết luận sai về chính harness, ghi vào ADR. Hai cái giá đó không đối
 * xứng, nên khi phân vân thì nghiêng về `?`.
 */
/**
 * Suy số issue từ tên nhánh. HÀM THUẦN — tách để test được, cùng lý do `dangerousCommand()`.
 *
 * Trả `{ issue, from }`, và `from` là phần đáng giá: nó nói RA phép suy nào đã dùng.
 *   · `''`   — nhánh tích hợp / nhánh việc-nhà: KHÔNG CÓ issue (đúng, không phải thiếu)
 *   · `null` — KHÔNG SUY RA ĐƯỢC ⇒ `?`, không phải `ok`
 *
 * VÌ SAO CÓ NHÁNH `bare` (#96). `project.issuePrefixes` là hạt giống kiểu Jira (`["ABC"]`).
 * Đo trên toàn bộ 30 nhánh từng tồn tại ở repo này:
 *
 *     21 nhánh  `<type>/<số>-<slug>`  (fix/100-…, feat/85-…)   → prefix khớp 0
 *      9 nhánh  không có số            (docs/retro-w32-lan-ba)  → đúng khi bỏ qua
 *      0 nhánh  dạng `ABC-123`
 *
 * Tức prefix mặc định khớp KHÔNG MỘT NHÁNH NÀO, và ba nghi thức đọc `?` trên **mọi** nhánh
 * làm việc — chúng chỉ xanh khi đứng trên `main`, đúng lúc không có gì để nói.
 *
 * NEO VÀO ĐẦU, không quét cả tên. `feat/promote-L0005-bo-dem…` có số ở giữa và KHÔNG được
 * đọc là issue 5. Cho phép một chữ cái đuôi vì `fix/44b-…` (nhánh nối tiếp #44) có thật ở đây.
 *
 * Bản trước còn tệ hơn theo hướng ngược lại: `prefixes` rỗng ⇒ biểu thức thành `()-?\d+` ⇒
 * khớp CHUỖI SỐ BẤT KỲ ở BẤT KỲ ĐÂU trong tên nhánh. Nhánh `bare` có neo là chặt hơn, không
 * lỏng hơn.
 *
 * BẮN NHẦM CÓ THẬT và không vá được offline: `fix/2-space-indent` sẽ đọc là issue 2. Không
 * đổi thành `?` để né — `?` là cái giá phải trả trên 100% nhánh, còn bắn nhầm cần ai đó đặt
 * tên nhánh bằng một con số không phải issue (0/30 trong lịch sử). Thay vào đó `from` được
 * trả về để chỗ hiển thị nói rõ "suy từ số trần", biến một phán đoán sai thành một phán đoán
 * NHÌN THẤY ĐƯỢC.
 */
/**
 * Ai đang chạy lệnh này — hoặc `null` nếu KHÔNG BIẾT. HÀM THUẦN qua `env` để test được.
 *
 * `null` chứ không phải `''`, và đó là toàn bộ ý của hàm này. Đo 2026-08-08 (#114):
 *
 *     $ node -e "console.log(process.env.DEV_ID)"      → CHANGEME-ten-cua-ban
 *     $ tail -3 .claude/telemetry/harness-edits.log    → …|CHANGEME-ten-cua-ban  (cả 3 dòng)
 *
 * Sổ đó là thứ làm cửa thoát `HARNESS_DRI=1` **audit được** — lý do duy nhất nó được chấp
 * nhận thay vì bị coi là lỗ hổng. Câu nó phải trả lời là *"AI đã ghi vào vùng cấm?"*, và
 * hôm đó có hai phiên Claude Code song song trên cùng máy: một mở DRI, một không. Sổ không
 * phân biệt được. Đúng câu hỏi nó sinh ra để trả lời là câu nó không trả lời được.
 *
 * Và cái gác cho đúng chuyện này ĐÃ CÓ — `check-reservations.mjs` in *"Chưa set DEV_ID"* —
 * nhưng điều kiện của nó là `me` RỖNG. `"CHANGEME-ten-cua-ban"` không rỗng, nên nhánh cảnh
 * báo đó **chưa từng chạy một lần nào**, kể cả trên repo chưa ai khai gì.
 *
 * Lỗi thật nằm ở chỗ mô hình hoá: *"chưa khai"* bị viết thành *"chuỗi rỗng"*, trong khi thực
 * tế nó là *"còn nguyên giá trị mẫu"*. Placeholder đi lọt mọi phép kiểm vì nó là một giá trị
 * hợp lệ **về mặt kiểu**. Cùng lớp với #96 (`issuePrefixes: ["ABC"]`).
 *
 * TRẢ VỀ `{ id, from }` vì đây là HAI câu hỏi khác nhau, và gộp chúng là cách tái tạo đúng
 * lỗi đang sửa:
 *
 *   · *"ghi tên nào vào sổ?"*      → `id`, giá trị thật tốt nhất tìm được
 *   · *"DEV_ID đã được khai chưa?"* → `from === 'DEV_ID'`
 *
 * Trên Windows `USERNAME` LUÔN có. Nếu chỉ trả một chuỗi thì `id` không bao giờ rỗng, cảnh
 * báo không bao giờ bắn, và ta quay lại đúng chỗ xuất phát — chỉ khác cái tên biến.
 *
 * Và `USERNAME` không thay được `DEV_ID`: chú thích ở `check-reservations.mjs` đã ghi lý do —
 * *cùng một người trên hai máy thường có `USERNAME` khác nhau*, nên reservation của chính bạn
 * đọc ra là của người khác.
 */
export function devId(env = process.env) {
  for (const key of ['DEV_ID', 'USER', 'USERNAME']) {
    const s = String(env[key] ?? '').trim();
    if (!s) continue;
    if (/^CHANGEME/i.test(s)) continue;   // hạt giống của template KHÔNG phải một cái tên
    return { id: s, from: key };
  }
  return { id: null, from: null };
}

export function inferIssue(branch, prefixes = []) {
  if (!branch || /^(main|master|develop)$/.test(branch)) return { issue: '', from: 'integration' };
  const list = (Array.isArray(prefixes) ? prefixes : []).map((p) => String(p).trim()).filter(Boolean);
  if (list.length) {
    const src = list.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const m = branch.match(new RegExp(`(${src})-?\\d+`, 'i'));
    if (m) return { issue: m[0], from: 'prefix' };
  }
  const bare = branch.match(/^[a-z]+\/(\d+)[a-z]?(?=[-/]|$)/i);
  if (bare) return { issue: bare[1], from: 'bare' };
  if (/^(chore|docs|ci|test)\//.test(branch)) return { issue: '', from: 'chore' };
  return { issue: null, from: null };
}

export function infraFailure(text) {
  const t = String(text || '').toLowerCase();
  const SIGNS = [
    [/hit your (session|usage) limit|usage limit reached/, 'chạm trần phiên/quota'],
    [/rate limit|too many requests|\b429\b/, 'rate limit'],
    [/credit balance is too low|insufficient credit|billing/, 'hết credit / thanh toán'],
    [/invalid api key|authentication_error|not authenticated|unauthorized|\b401\b/, 'xác thực'],
    [/econnrefused|enotfound|etimedout|network error|fetch failed/, 'mạng'],
    [/\b50[0234]\b|internal server error|service unavailable|overloaded/, 'phía nhà cung cấp'],
  ];
  for (const [re, why] of SIGNS) if (re.test(t)) return why;
  return null;
}

/**
 * NGÂN SÁCH CỦA TASK ĐÃ CẠN — trạng thái thứ TƯ, và nó KHÔNG phải `infraFailure`.
 *
 * Khác biệt quyết định: hạ tầng hỏng thường TẠM THỜI ⇒ *"chạy lại khi hạ tầng ổn"* là lời
 * khuyên đúng. Cạn ngân sách thì **chạy lại KHÔNG giúp gì** — trần do chính task khai, nên
 * lần sau nó cạn ở đúng chỗ đó. Hai việc phải làm khác nhau ⇒ hai hàm, hai câu.
 *
 * Đo 2026-08-10 (#147): `claude -p` thoát **1** khi chạm trần lượt, nên `agent.ok === false`,
 * nên task rơi vào cùng rổ `FAIL` với *"agent hạ `dcg` xuống fail-open"*. Ba task cùng lượt
 * đo ra `REGRESSION 0% (0/3)` — và cả ba là artifact. Một trong ba (`0007`) thực ra làm việc
 * ĐÚNG tới lúc hết lượt: nó viết 7 ca test có răng thật, và bị chấm là thất bại.
 *
 * Đây đúng lớp lỗi mà `infraFailure` ra đời để chống (#93), ở một trạng thái chưa ai tách.
 *
 * PHẠM VI HẸP, cố ý. Chỉ nhận diện chữ ký NGÂN SÁCH, không nhận diện "agent bỏ cuộc" hay
 * "agent trả lời ngắn" — nới ra thì mọi task khó thành `n/a` và tỉ lệ biến mất, đúng chiều
 * nói dối im lặng mà bảng ca của `infraFailure` đã phải khoá hai đầu.
 *
 * Trần WALL-CLOCK không đi qua đây: nó không để lại chữ trong output, `spawnSync` báo bằng
 * `signal === 'SIGTERM'`. Người gọi gộp hai nguồn — xem `runAgent()` ở `evals/run.mjs`.
 */
export function budgetExhausted(text) {
  const t = String(text || '').toLowerCase();
  const SIGNS = [
    [/reached max turns|max turns (exceeded|reached)|maximum (number of )?turns/, 'chạm trần LƯỢT do task khai'],
  ];
  for (const [re, why] of SIGNS) if (re.test(t)) return why;
  return null;
}

/**
 * PHONG BÌ KẾT QUẢ của agent — lời khai CÓ CẤU TRÚC, thay cho việc đoán từ văn xuôi.
 *
 * `claude -p --output-format json` in một object JSON thay cho transcript. Đo 2026-08-10
 * (#153), lúc cạn trần lượt:
 *
 *   is_error true · subtype "error_max_turns" · terminal_reason "max_turns" · num_turns 2 · exit 1
 *
 * Hai điều quan trọng, và điều thứ hai là lý do hàm này tồn tại:
 *
 *   ① **`num_turns` là con số duy nhất chưa có để đóng #144.** Trần `maxTurns` của bộ task
 *      (`6 · 8 · 10 · 15 · 20`) là số ĐOÁN; ở đây nó thành số ĐO. Không có nó thì *"agent thật
 *      sự dùng bao nhiêu lượt"* là khảo cổ transcript.
 *   ② **Chuỗi `Reached max turns` KHÔNG xuất hiện ở chế độ JSON.** `budgetExhausted()` khớp
 *      regex trên văn xuôi, nên bật `--output-format json` là làm bộ dò của #147 mù — và
 *      docstring của `evals/run.mjs` lấy đúng cờ đó làm ví dụ mẫu. Cạn lượt sẽ lại bị chấm
 *      *"agent làm sai"*.
 *
 * TRẢ `null` KHI KHÔNG PHẢI JSON, và đó là ca THƯỜNG GẶP: `evals.command` không bắt buộc là
 * `claude`, và không bắt buộc bật cờ đó. `null` ⇒ người gọi rơi về đường văn xuôi, không mất gì.
 *
 * Đòi `num_turns` là SỐ để nhận: một JSON bất kỳ trong output (agent in ra một object khi trả
 * lời) KHÔNG được đọc thành phong bì. Đây là chỗ hàm này dễ sai theo chiều im lặng nhất — nhận
 * nhầm thì `turns` là rác, và một con số rác nguy hiểm hơn không có số.
 */
export function agentEnvelope(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  // Thử cả chuỗi trước, rồi từng dòng từ CUỐI lên: phong bì là thứ in RA SAU CÙNG, và một
  // lời cảnh báo của runtime ở dòng đầu không được làm hỏng phép đọc.
  const candidates = [s, ...s.split('\n').map(l => l.trim()).filter(l => l.startsWith('{')).reverse()];
  for (const c of candidates) {
    let o;
    try { o = JSON.parse(c); } catch { continue; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
    if (typeof o.num_turns !== 'number') continue;
    return {
      turns: o.num_turns,
      terminal: typeof o.terminal_reason === 'string' ? o.terminal_reason : null,
      subtype: typeof o.subtype === 'string' ? o.subtype : null,
      isError: o.is_error === true,
      costUsd: typeof o.total_cost_usd === 'number' ? o.total_cost_usd : null,
      denials: Array.isArray(o.permission_denials) ? o.permission_denials.length : null,
    };
  }
  return null;
}

/**
 * Phong bì có khai CẠN TRẦN LƯỢT không — tách khỏi `agentEnvelope` vì nó là một PHÁN ĐOÁN,
 * còn hàm kia là một phép ĐỌC. Hai chữ ký, vì vendor đã cho hai và chúng có thể lệch nhau ở
 * đời CLI sau; đòi cả hai cùng có là tự chuốc một điểm mù.
 */
export function envelopeBudget(env) {
  if (!env) return null;
  if (env.terminal === 'max_turns' || env.subtype === 'error_max_turns') return 'chạm trần LƯỢT do task khai';
  return null;
}

/**
 * ═══ `git checkout --` NÀO LÀ "BỎ CẢ CÂY", VÀ CÁI NÀO LÀ MỘT BƯỚC DỌN (#160) ══
 *
 * Ca thứ BA của `L0002` (*"guard bắn nhầm còn tệ hơn không có guard"*). Rule cũ là
 * `/^git\s+checkout\s+--\s/` — khớp **mọi** pathspec, nên nó không phân biệt được:
 *
 *   git checkout -- .                     bỏ CẢ CÂY                         ⇒ CHẶN
 *   git checkout -- tooling/rituals.mjs   khôi phục ĐÚNG 1 file vừa cố ý sửa ⇒ CHO QUA
 *
 * Vế thứ hai là **bước dọn bắt buộc của mutation test** — thứ chính harness đòi hỏi. Đo
 * 2026-08-10 (`fixlog` + `gate-fails.log` `02:49` · `02:59` · `07:38`): 3 lần bị chặn.
 *
 * VÀ ĐÂY LÀ PHẦN ĐẮT NHẤT: đường vòng thực tế đã dùng là `writeFileSync` từ Node — **không có
 * telemetry**. Guard vẫn chạy, vẫn đếm `17 chặn`, trông khoẻ hơn trước; thứ chuyển đi là HÀNH
 * VI THẬT. Một guard bắn nhầm tự che dấu vết của chính nó, nên số đo của nó KHÔNG phát hiện
 * được chuyện này — chỉ `fixlog` (người tự ghi) mới thấy.
 *
 * ── HAI CHIỀU, và bản vá này đi CẢ HAI
 *
 * NỚI: có pathspec cụ thể ⇒ không khớp. Cùng khuôn `danger-zones.md §3` đã dùng cho migration
 * (*"đã merge thì chặn, chưa merge thì sửa thoải mái"*) — nguyên tắc đã có trong repo.
 *
 * SIẾT: rule cũ đòi một khoảng trắng SAU `--`, nên `git checkout --` trần (cũng là bỏ cả cây)
 * **đi lọt**; và `git checkout HEAD -- .` cũng đi lọt vì có token đứng trước `--`. Cả hai nay bị
 * chặn. Một bản vá chỉ-nới sẽ để nguyên hai lỗ đó, và không ai đếm chúng.
 *
 * ── VÌ SAO Ở `lib` CHỨ KHÔNG NẰM TRONG `dcg.mjs`
 *
 * Cùng lý do với `SECRET_PATTERNS` phía dưới, và cùng cái giá đã đo: một danh sách tồn tại HAI
 * BẢN thì bản ít người nhìn sẽ thiếu mục. Bảng ca của rule này phải phân biệt được `.` với
 * `./src`, và một bảng như thế chỉ có nghĩa khi nó khẳng định vào **chính** regex mà hook dùng.
 * `dcg.mjs` chạy ngay lúc import (nó đọc stdin), nên test KHÔNG import được nó — không đưa ra
 * đây thì bảng ca buộc phải chép lại regex, và bản chép đó sẽ đúng đúng một ngày.
 *
 * `simpleCommands()` đã chuẩn hoá khoảng trắng về MỘT dấu cách và bỏ nháy trước khi khớp, nên
 * regex này không phải lo `\s+` giữa các token hay `"."`.
 *
 * CHƯA LÀM, ghi ra để nó không biến mất: `git restore .` là ca CÙNG LỚP nhưng KHÁC rule, và
 * `git checkout .` (không `--`) cũng vậy. Cả hai là điều cấm MỚI ⇒ ratchet `dcg ↔ permissions.deny`
 * tăng ⇒ phải có tầng một đi kèm. Không gộp vào đây: nới và siết cùng lúc trên một rule đã đủ
 * hai chiều để lần review sau còn đọc được.
 */
export const GIT_DISCARD_WHOLE_TREE =
  /^git\s+checkout\s+(?:\S+\s+)*--(?:$|\s(?:\S+\s)*(?:\.\.\/|\.\.|\.\/|\.|:\/|\*)(?:\s|$))/;

/**
 * ═══ BACKTICK NGOÀI NHÁY ĐƠN LÀ COMMAND SUBSTITUTION, KHÔNG PHẢI VĂN BẢN (#177) ══
 *
 * Lớp lỗi `Context`, không phải `Constraint`: đây là kiến thức tôi **CÓ** — nó nằm trong
 * auto-memory nhiều phiên liền — và vẫn vi phạm **≥9 lần**. Một lời nhắc đã thuộc lòng mà vẫn
 * bị vi phạm thì không phải cơ chế, nó là ghi chép. Dạng rẻ hơn trên thang giá (gotcha 1 dòng)
 * **đã thử và đã thất bại có bằng chứng**.
 *
 * Thiệt hại đo được, 2026-08-07: `cap > 0` trong `node -e` bị bash đọc thành **redirect** ⇒ tạo
 * một file rỗng tên `0` ở gốc repo (`apply-to.mjs --audit` bắt được); một lần suýt ghi hỏng
 * `MEMORY.md`; backtick trong `--title` của `gh issue create` bị thay bằng output của lệnh.
 *
 * NHÁY ĐƠN LÀ AN TOÀN và đó là nửa quan trọng hơn của hàm này. Bash không diễn giải gì bên
 * trong `'…'`, nên bắt cả hai loại nháy là bắn nhầm — và `L0002` vừa tính xong cái giá của
 * việc đó ở #160. Backtick **KHÔNG có nháy** cũng bị thay, nên nó cùng nhóm với nháy kép.
 *
 * `\` trước một ký tự vô hiệu hoá nó ở mọi nơi TRỪ trong nháy đơn — nên `"\`"` là backtick
 * literal và KHÔNG phải hazard.
 */
export function backtickSubstitution(raw) {
  const s = String(raw ?? '');
  let quote = null;                                  // null | "'" | '"'
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote !== "'" && ch === '\\') { i++; continue; }
    if (quote === null && (ch === "'" || ch === '"')) { quote = ch; continue; }
    if (quote !== null && ch === quote) { quote = null; continue; }
    if (ch === '`' && quote !== "'") return true;
  }
  return false;
}

/**
 * Hazard backtick TRONG một đối số VĂN BẢN DÀI — hàm THUẦN trên một lệnh đơn.
 *
 * HẸP CÓ CHỦ Ý. `echo "hôm nay là \`date\`"` là command substitution **cố ý** và hợp lệ; chặn
 * nó là đúng thứ `L0002` cấm. Bảy lần đã đo đều nằm trong đúng hai hình dạng — `node -e|--eval`
 * và `gh --title|--body` — nên rule khoá vào chúng thay vì vào "mọi backtick".
 *
 * Đọc `c.raw` (còn nguyên nháy) chứ không `c.text`: `simpleCommands()` **bỏ nháy** trước khi
 * khớp, nên tới lúc một rule `re` nhìn thấy chuỗi thì thông tin cần thiết đã mất. Đây là lý do
 * rule này phải là `test:` chứ không thể là `re:`.
 */
export function backtickEvalHazard(c) {
  if (!c || !/^(node|gh)$/.test(String(c.program ?? ''))) return false;
  if (!/(?:^|\s)(?:-e|--eval|--title|--body)(?:[\s=]|$)/.test(String(c.text ?? ''))) return false;
  return backtickSubstitution(c.raw);
}

/**
 * Cùng phán đoán, nhưng cắt lệnh **KHÔNG theo `\n`** — đây mới là thứ `dcg` cắm.
 *
 * `backtickEvalHazard` một mình đủ cho lệnh MỘT DÒNG và trượt lệnh nhiều dòng, tức trượt đúng
 * nhóm đã đo (7 lần, đều là văn bản tiếng Việt nhiều dòng). Bộ ca test ban đầu toàn một dòng
 * nên nó xanh — lỗ chỉ lộ ra khi guard để lọt một lệnh THẬT của tôi, một giờ sau khi merge.
 *
 * Vẫn giữ nguyên vế hẹp: chương trình phải là `node|gh`, và phải có cờ văn-bản-dài. Nên
 * `cd /x && grep -e "…"` không khớp, còn `node -e "<nhiều dòng có backtick>"` thì có.
 */
export function backtickEvalHazardIn(cmd) {
  return simpleCommands(cmd, { splitNewlines: false }).some(backtickEvalHazard);
}

/**
 * PHÁN ĐOÁN của `dcg` — hàm THUẦN, test khẳng định thẳng vào đây.
 *
 * Rule có `program` chỉ nổ khi một LỆNH ĐƠN có đúng chương trình đó, và khớp trên dạng đã bỏ
 * nháy. Rule KHÔNG có `program` quét toàn bộ chuỗi đã bỏ heredoc — dùng cho những nhóm mà
 * thứ nguy hiểm nằm bên trong một đối số (SQL) hoặc không có chương trình cố định (fork bomb).
 */
export function dangerousCommand(cmd, rules) {
  const cmds = simpleCommands(cmd);
  const whole = stripHeredocs(cmd);
  for (const r of rules) {
    // `test:` — dành cho phán đoán mà REGEX KHÔNG BIỂU DIỄN ĐƯỢC. Ca duy nhất tới giờ (#177):
    // "backtick nằm ngoài nháy đơn" cần TRẠNG THÁI nháy, mà `r.re` thì khớp trên `c.text` —
    // bản ĐÃ BỎ NHÁY. Nhận cả object lệnh đơn nên nó đọc được `raw` (còn nguyên nháy).
    if (r.testWhole) {
      // Rule tự cắt lấy — dành cho phán đoán mà phép cắt mặc định (theo `\n`) phá mất ngữ
      // cảnh. Nhận CHUỖI GỐC, không nhận `whole`: hàm tự gọi `stripHeredocs`.
      if (r.testWhole(cmd)) return { ...r, matched: whole.slice(0, 200) };
    } else if (r.test) {
      const hit = cmds.find(c => r.test(c));
      if (hit) return { ...r, matched: hit.text.slice(0, 200) };
    } else if (r.program) {
      const hit = cmds.find(c => r.program.test(c.program) && r.re.test(c.text));
      if (hit) return { ...r, matched: hit.text.slice(0, 200) };
    } else if (r.re.test(whole)) {
      return { ...r, matched: whole.slice(0, 200) };
    }
  }
  return null;
}

export function toolContent(input) {
  const ti = input?.tool_input ?? {};
  return String(ti.content ?? ti.new_string ?? ti.new_source ?? '');
}

/**
 * Hình dạng của một secret bị lọt vào NỘI DUNG file. MỘT nguồn, hai tầng dùng.
 *
 * VÌ SAO NÓ Ở ĐÂY. Danh sách này từng tồn tại HAI BẢN — `.claude/hooks/block-secrets.mjs`
 * (7 pattern) và `tooling/precommit-scan.mjs` (5). Đo 2026-08-04: bản ở pre-commit thiếu
 * **Slack token** và **JWT**.
 *
 * Chiều của lỗ đó là chiều tệ hơn. Hook `block-secrets` là PreToolUse: nó chỉ thấy thứ
 * AGENT ghi. Tầng duy nhất thấy thứ NGƯỜI gõ tay là `pre-commit` — và đó chính là tầng
 * thiếu hai pattern. Một Slack token do người dán vào file rồi commit đi qua sạch.
 *
 * Hai bản của một sự thật không lệch vào ngày viết; chúng lệch vào ngày ai đó thêm một
 * pattern và chỉ thấy một chỗ. Nên chỗ sửa không phải "thêm hai pattern vào bản kia" —
 * đó chỉ đặt lại đồng hồ cho lần lệch sau.
 *
 * KHÔNG nới pattern cho dễ chịu: miễn trừ đi qua marker `harness-allow-secret` theo
 * DÒNG (xem `precommit-scan.mjs`), tường minh và audit được, không allowlist cả file.
 */
export const SECRET_PATTERNS = [
  { re: /\bsk-[A-Za-z0-9_-]{20,}/, name: 'API key dạng sk-' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, name: 'AWS access key' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, name: 'private key' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{30,}/, name: 'GitHub token' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, name: 'Slack token' },
  { re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, name: 'JWT' },
  { re: /(postgres|mysql|mongodb(\+srv)?):\/\/[^\s:@/]+:[^\s@/]+@/, name: 'connection string có mật khẩu' },
];

/**
 * Dòng mà `.gitignore` / `.gitattributes` của MỌI repo áp harness phải có.
 * MỘT nguồn, hai tầng dùng: `apply-to.mjs` THÊM dòng thiếu, `harness-doctor.mjs` KIỂM.
 *
 * VÌ SAO NÓ TỒN TẠI. Hai file này từng nằm trong `SEED` của `apply-to.mjs`, và `SEED`
 * **không bao giờ ghi đè file đã tồn tại**. Mọi project THẬT đều đã có `.gitignore`
 * ⇒ với đúng nhóm project mà harness nhắm tới, các dòng dưới đây im lặng KHÔNG tới.
 * Chỉ project trống rỗng nhận được chúng — tức là cơ chế chỉ hoạt động ở ca không cần nó.
 *
 * Hậu quả không phải lý thuyết: project commit `.claude/settings.local.json` (van xả áp
 * CÁ NHÂN của một người trở thành cấu hình của cả đội) và `.claude/telemetry/` (log
 * máy-cục-bộ vào lịch sử chung, xung đột ở mọi PR). Và `* text=auto eol=lf` — điều số 8
 * trong "mười hai điều" của README — cũng không tới, nên lớp conflict GIẢ mà nó xoá được
 * vẫn còn nguyên ở đúng những repo đa OS.
 *
 * ĐÂY LÀ DANH SÁCH TỐI THIỂU, KHÔNG PHẢI CẢ FILE. Copy cả file là phép sai (project có
 * ignore riêng của họ, và ghi đè nó là phá dữ liệu). Thêm dòng thiếu là phép đúng: nó
 * idempotent, và nó không có ý kiến gì về phần còn lại của file.
 *
 * Vắng một dòng ở đây KHÔNG phải "đội họ có sở thích khác" — nó là dữ liệu cá nhân hoặc
 * log đi vào lịch sử chung. Nên apply-to thêm lại nó ở MỌI lần áp, cố ý, kể cả khi có
 * người đã xoá tay. Muốn thật sự bỏ thì sửa danh sách này trong một PR có người duyệt.
 */
export const REQUIRED_IGNORE = [
  '.claude/settings.local.json',
  '.claude/worktrees/',
  '.claude/telemetry/',
  '.claude/state/',
  'knowledge/incoming/',
  '.harness-pack/',
];
export const REQUIRED_ATTRIBUTES = ['* text=auto eol=lf'];

/**
 * Chỉ thêm khi git ĐANG ignore một file harness phải commit — ca gần như chắc chắn gặp:
 * rất nhiều repo đã có `.claude/` trong `.gitignore` TRƯỚC khi áp harness, vì đó là lời
 * khuyên phổ biến cho cấu hình agent cá nhân. Áp harness vào đó mà không sửa nghĩa là
 * `.claude/hooks/` và `.claude/settings.json` không bao giờ được commit: cả đội tưởng
 * mình có harness, nhưng chỉ MỘT người — người chạy apply-to — thật sự có.
 *
 * PHẢI là `!.claude/`, KHÔNG phải `!.claude/settings.json`. Đo 2026-08-05 bằng
 * `git check-ignore`: sau một dòng loại cả thư mục (`.claude/`), mọi phủ định cho FILE
 * bên trong đều VÔ TÁC DỤNG — git không re-include file có thư mục cha bị loại. Dòng
 * `!.claude/settings.json` trông như đã sửa, và không sửa gì cả. Đây đúng là dạng lỗi
 * tệ nhất của lớp này: nó im lặng và nó trông như đã xong.
 */
export const REQUIRED_UNIGNORE = ['!.claude/'];

/**
 * Cửa thoát trong `ci.yml` — đúng ở REPO TEMPLATE (nơi `commands` rỗng là placeholder và
 * không có dòng này thì CI template đỏ vĩnh viễn), SAI ở mọi project đích (gate bị bỏ qua
 * vẫn cho tick XANH).
 *
 * MỘT nguồn, ba nơi dùng: `apply-to` xoá lúc copy · migration `004` xoá cho project đã áp
 * bản cũ · `harness-doctor` báo CHẶN nếu nó còn. Trước 2.6.0 chỉ có đường `upgrade` xử lý
 * nó, nên project áp MỚI nhận cửa thoát và một dòng CHẶN của doctor ngay từ phút đầu —
 * chào mừng bằng một lỗi mà chính công cụ vừa tạo ra.
 *
 * KHÔNG dùng `[\s\S]*?`: neo chính xác `env:` ở 4 space, comment ở 6 space, rồi đúng dòng
 * biến. Lazy match sẽ ăn sang `steps:` nếu ai đó đổi thứ tự.
 */
export const CI_ESCAPE_HATCH = /\n {4}env:\n(?: {6}#[^\n]*\n)* {6}HARNESS_ALLOW_SKIPPED_GATES: '1'\n/;

/**
 * LỚP CƠ CHẾ: file thuộc về harness, không thuộc về project — cập nhật được, không hỏi.
 * `apply-to.mjs` copy nó sang project mới; `upgrade.mjs` cập nhật nó ở project đã áp.
 *
 * MỘT DANH SÁCH, HAI NƠI DÙNG — vì trước 2.6.0 nó là hai danh sách, và chúng đã lệch:
 * `upgrade.mjs → MECHANISM` **thiếu `tooling/gates.mjs`**. Nghĩa là runner gate — file mà
 * cả ba stage và cả CI đều gọi — chưa bao giờ được cập nhật qua đường nâng cấp. Sửa một
 * lỗi trong nó ở template sẽ không tới project nào, và không gì báo: project vẫn chạy bản
 * 2.0.0 của gates.mjs trong khi manifest ghi 2.4.1.
 *
 * Đây đúng lớp bug mà `apply-to --audit` sinh ra để chặn, nhưng audit chỉ soi MỘT trong hai
 * danh sách. Hai bản của một sự thật không lệch vào ngày viết; chúng lệch vào ngày ai đó
 * thêm một file và chỉ thấy một chỗ.
 *
 * `tooling/generators/` KHÔNG ở đây: README của nó là SEED (project viết generator của
 * riêng họ vào đó), và một thứ vừa là SEED vừa là cơ chế sẽ bị ghi đè ở lần nâng cấp đầu.
 */
/**
 * VAI của repo đang chạy. BA giá trị, không hai.
 *
 *   'template'  — nguồn: có `tooling/cli.mjs`, KHÔNG có manifest
 *   'consumer'  — đã áp: có `.claude/harness-manifest.json` (chỉ apply-to/upgrade ghi ra)
 *   'unknown'   — không đủ dấu hiệu: cài tay, copy dở, hoặc manifest bị xoá
 *
 * VÌ SAO MỘT HÀM. Trước 2.7.7 câu hỏi này được hỏi ở **5 chỗ với 3 định nghĩa khác nhau**:
 * `apply-to` chỉ xét manifest; `harness-doctor` và `setup` xét 3 điều kiện; `entropy-scan`
 * tính CẢ `IS_TEMPLATE` LẪN `IS_CONSUMER` **riêng rẽ trong cùng một file** — và hai biến đó
 * KHÔNG bù nhau: một repo không có cả manifest lẫn changelog thì cả hai đều `false`.
 *
 * Trạng thái đó có thật (ai đó copy `.claude/` bằng tay) và chưa từng được đặt tên, nên mỗi
 * tool âm thầm chọn một mặc định khác nhau cho nó. Đúng phép gộp `0` với `n/a` mà repo này
 * cấm ở mọi nơi khác — chỉ có điều nó nằm trong phép TỰ NHẬN DIỆN của chính harness.
 *
 * `consumer` thắng khi có manifest: template không bao giờ có file đó.
 *
 * ── DẤU HIỆU "TEMPLATE" PHẢI LÀ THỨ KHÔNG BAO GIỜ ĐI XUỐNG REPO CON
 *
 * Tới 2.13.0 dấu hiệu đó là `HARNESS-CHANGELOG.md` + `tooling/apply-to.mjs` — và **cả hai
 * đều được ship sang repo con**. Nghĩa là mọi repo tiêu thụ đều mang đủ giấy tờ để bị nhận
 * nhầm là template; thứ duy nhất ngăn điều đó là manifest được xét TRƯỚC. Một phép nhận dạng
 * mà bằng chứng dương tính của nó có mặt ở cả hai phía thì không phân biệt được gì — nó chỉ
 * đang được cứu bởi thứ tự câu lệnh.
 *
 * Và trạng thái "có harness mà không có manifest" KHÔNG phải giả thuyết: `harness-migrations/010`
 * có hẳn một nhánh cho nó ("repo áp bằng đường khác ⇒ không có manifest ⇒ không xoá gì").
 * Rơi vào đó thì repo con bị gọi là template, và mọi thứ hạ cấp theo vai template — kể cả
 * dòng CHẶN "commands rỗng ⇒ GATE KHÔNG TỒN TẠI" — sẽ im, ở đúng nơi nó cần kêu nhất.
 *
 * `tooling/cli.mjs` là điểm vào `npx github:…` của TEMPLATE. Nó nằm trong `IGNORE` của
 * `apply-to.mjs` với lý do viết sẵn ("ở project đích nó không có việc gì làm"), nên nó
 * **không thể** xuất hiện ở repo con qua đường chính thức. Đó là điều kiện cần của một dấu
 * hiệu nhận vai: chỉ tồn tại ở đúng một phía.
 *
 * Hỏng thì hỏng về phía an toàn: xoá `cli.mjs` khỏi template ⇒ `unknown` ⇒ `harness-doctor`
 * CHẶN kèm thông báo, chứ không âm thầm nhận nhầm vai.
 *
 * MỘT dấu hiệu, không phải hai. Bản đầu của bản vá này để `cli.mjs && apply-to.mjs` cho
 * "chắc ăn" — nhưng `apply-to.mjs` ĐƯỢC ship, nên vế đó đúng ở CẢ HAI phía và không phân
 * biệt được gì; nó chỉ làm bất biến khó đọc và mời gọi người sau tưởng nó đang bảo vệ điều
 * gì đó. Test `repoRole(): dấu hiệu không nằm trong MECHANISM_PATHS` bắt đúng chỗ này, ngay
 * trong lần chạy đầu tiên sau khi viết nó.
 */
export function repoRole() {
  if (exists(repoPath('.claude', 'harness-manifest.json'))) return 'consumer';
  if (exists(repoPath('tooling', 'cli.mjs'))) return 'template';
  return 'unknown';
}

/**
 * BIA MỘ — thứ template đã BỎ, và phải được bỏ luôn ở project đã áp.
 *
 * Lớp phân phối biết THÊM và biết SỬA, nhưng cho tới 2.11.0 nó KHÔNG biết XOÁ. Hệ quả đo được
 * 2026-08-05: `/whats-new` bị cắt khỏi template ở **v2.4.0** (commit `21834ca`) và vẫn nằm ở
 * **cả ba** repo tiêu thụ — sáu version sau. Nó đẩy cả ba lên 13 skill trên trần 12, nên
 * `entropy-scan` báo đỏ ở mọi phiên về một thứ mà project KHÔNG gây ra và KHÔNG sửa được bằng
 * cách nâng cấp.
 *
 * Đây là chiều ngược của lỗ hổng đã sửa ở 2.8.0 (sự kiện hook mới không tới được repo cũ):
 * cùng một nguyên nhân — lớp phân phối chỉ đồng bộ MỘT CHIỀU.
 *
 * VÌ SAO PHẢI LÀ DANH SÁCH TƯỜNG MINH, không phải suy luận "có ở đích mà không có ở template".
 * Phép suy luận đó KHÔNG phân biệt được ba thứ: (a) harness đã bỏ, (b) project tự thêm,
 * (c) một công cụ khác cài vào (`prisma init` đổ 9 skill vào `.claude/skills/` — có thật, xem
 * fixlog của `warehouse`). Xoá theo suy luận là xoá cả (b) và (c). Bia mộ thì chỉ nói về (a),
 * và mỗi dòng phải ghi VERSION nào đã bỏ để còn tra lại được.
 */
/**
 * KHOÁ NHÓM của một dòng fixlog — 6 từ đầu dài hơn 3 ký tự, đã chuẩn hoá.
 *
 * Ở ĐÂY vì nó có BA nơi dùng: `fixlog.mjs --top` (hiển thị), `rituals.mjs` (đếm nhóm ≥2 lần),
 * và `fixlog.mjs --close` (đóng một nhóm). Ba bản sao của một phép nhóm là ba cơ hội để chúng
 * lệch nhau — và khi lệch, `--close` sẽ đóng một khoá mà `--top` không bao giờ sinh ra, tức
 * nút "đã xử lý" bấm vào không có tác dụng và không có gì báo.
 *
 * Bản sao thứ hai đã tồn tại từ 2.10.0 kèm một comment tiên đoán đúng chuyện này. Comment
 * không ngăn được bản sao thứ ba; gộp lại thì ngăn được.
 *
 * ── GIỚI HẠN CỦA PHÉP NHÓM TỪ VỰNG, và vì sao có `rules`
 *
 * "6 từ đầu" là phép nhóm LEXICAL áp lên văn bản người viết TỰ DO. Nó chỉ gom được khi người
 * viết tình cờ mở đầu giống nhau — và đo 2026-08-06 trên chính repo này: 5 mục fixlog ⇒ 5 nhóm
 * đơn lẻ, 0 nhóm đạt ngưỡng, TRONG KHI 3/5 mục là cùng một gác (`dcg` chặn nhầm) và
 * bài học tuần W32 "dcg quét thân heredoc" (trong `.claude/learnings/`) đã ghi chúng là
 * lần 3, 4, 5.
 *
 * Hỏng theo chiều NGUY HIỂM: `/harness-retro` đọc "chưa nhóm nào đạt ngưỡng ≥2" — tức câu trả
 * lời DỄ CHỊU — trong khi sự thật là ngưỡng đã bị vượt từ lâu. Cùng lớp lỗi với `hookRan()`:
 * "không đo được" tự thu về "ổn".
 *
 * KHÔNG sửa bằng heuristic thông minh hơn (stemming, trùng token, khoảng cách chuỗi). Gom nhầm
 * hai lỗi KHÁC nhau thì BỊA ra một nhóm ≥2 chưa từng có — nó chế tạo bằng chứng, hỏng theo
 * chiều tệ hơn hẳn chiều đang có. Phép gom là một PHÁN ĐOÁN, và bắt regex đoán hộ chính là
 * "inferential control" mà AGENTS.md dặn đổi sang "computational control" bất cứ khi nào được.
 *
 * Nên: người khai nhóm (`fixlog.mjs --group`), máy chỉ áp dụng. `rules` là danh sách
 * `{ key, needle }` theo thứ tự file; luật ĐẦU TIÊN khớp thì thắng ⇒ tất định. Không có luật
 * nào khớp thì rơi về phép từ vựng cũ — nên `fixlogKey(text)` không đổi hành vi.
 *
 * Hàm vẫn THUẦN: `rules` truyền vào, không đọc đĩa ở đây (xem `fixlogGroupRules()`).
 */
export function fixlogKey(text, rules = []) {
  const t = String(text).toLowerCase();
  // LUẬT CỤ THỂ HƠN THẮNG (needle DÀI HƠN), không phải luật tới trước.
  //
  // Đo 2026-08-11: sổ có hai luật — `dcg` (khai 08-06, ĐÃ ĐÓNG 08-07) và
  // `buoc DON DEP cua mutation` (khai 08-10, đang mở). Mục ngày 08-10 khớp CẢ HAI; luật cũ
  // rộng hơn và tới trước nên nó thắng, và mục đó thừa hưởng dấu ✔ của một nhóm đã đóng
  // TRƯỚC KHI nó tồn tại. `--top` báo 0 nhóm ★ ⇒ `/harness-retro` bước 4 thấy "không có gì
  // tới hạn", trong khi việc đó đang mở dưới dạng issue #160.
  //
  // "Dài hơn" chứ không phải "mới hơn": độ dài là thuộc tính của CHÍNH luật, nên phép chọn
  // không đổi theo thứ tự người ta khai. Chọn "mới hơn" thì một luật rộng khai sau sẽ nuốt
  // mọi luật hẹp khai trước — đúng chiều hỏng vừa gặp, chỉ đảo trục.
  //
  // BẰNG ĐỘ DÀI ⇒ giữ thứ tự file (luật đầu thắng). Ca `A`/`B` cùng needle `dcg` trong
  // `test-hooks` khoá đúng tính tất định đó.
  let best = null;
  for (const r of rules) {
    const needle = String(r?.needle || '').toLowerCase().trim();
    if (!needle || !t.includes(needle)) continue;
    if (!best || needle.length > best.len) best = { key: String(r.key), len: needle.length };
  }
  if (best) return best.key;
  return t
    .replace(/[^a-z0-9à-ỹ\s]/gi, ' ')
    .split(/\s+/).filter(w => w.length > 3).slice(0, 6).join(' ');
}

/** Đường dẫn file luật gom nhóm. Cùng thư mục telemetry với fixlog: đều là dữ liệu MÁY NÀY. */
export const FIXLOG_GROUPS_FILE = () => join(telemetryDir(), 'fixlog-groups.log');
export const FIXLOG_CLOSED_FILE = () => join(telemetryDir(), 'fixlog-closed.log');
export const FIXLOG_TRACKED_FILE = () => join(telemetryDir(), 'fixlog-tracked.log');

/**
 * Sổ đánh dấu nhóm (`fixlog-closed.log` · `fixlog-tracked.log`) → `Map<key, {ts, note}>`.
 *
 * MỘT phép đọc cho cả `fixlog --top` lẫn `rituals.fixlogState()`. Trước #182 mỗi bên tự parse
 * TSV này, và bản `rituals` **vứt cột thời gian** — nên hai bảng không thể cùng câu trả lời dù
 * có muốn (bug #176). Hai bên đọc tự lắp lại một phép đọc là hình dạng chính xác của #125.
 *
 * Khoá trùng: mục SAU đè mục trước — `--close` lần hai (sau tái phát) phải thắng lần một.
 */
export function groupMarks(file) {
  const m = new Map();
  try {
    if (!existsSync(file)) return m;
    for (const l of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
      const [ts, key, ...note] = l.split('\t');
      if (key) m.set(key, { ts, note: note.join(' ').trim() });
    }
  } catch { /* sổ hỏng ⇒ coi như chưa đánh dấu gì: mất một phép TRỪ, không mất mục fixlog nào */ }
  return m;
}

/**
 * Một nhóm ĐÃ ĐÓNG có còn đóng không — **THUẦN**, nhận mốc đóng + mốc các mục, trả phán quyết.
 *
 * `--close` ghi *"đã xử lý xong"* tại MỘT thời điểm. Mục xuất hiện SAU thời điểm đó là **tái
 * phát**, và dấu ✔ nói dối về nó. Đây là ca đáng canh nhất của cả cơ chế đóng nhóm: cùng một
 * lỗi quay lại sau khi bạn tuyên bố đã sửa tận gốc.
 *
 * HÀM RIÊNG, không viết inline ở hai chỗ — `fixlog --top` và `rituals.fixlogState()` trả lời
 * CÙNG một câu hỏi, và `test-hooks` ca ⑦ tồn tại vì hai bảng đó đã từng lệch nhau. Bản trước
 * `rituals` chỉ đọc KHOÁ trong `fixlog-closed.log` và vứt cả cột thời gian đi, nên nó không
 * thể phát hiện tái phát dù có muốn.
 *
 * Không có mốc đóng ⇒ `closed: false` (chưa từng đóng), KHÔNG phải "đang mở vì tái phát".
 * Hai chuyện đó khác nhau và `recurred` phân biệt được: rỗng ở ca một, có phần tử ở ca hai.
 */
export function groupStillClosed(closedTs, rowTimestamps = []) {
  const recurred = rowsAfter(closedTs, rowTimestamps);
  return { closed: Boolean(closedTs) && recurred.length === 0, recurred };
}

/** Mục ghi SAU một mốc, đã sắp. Không có mốc ⇒ `[]` (không có mốc thì không có "sau"). */
export function rowsAfter(ts, rowTimestamps = []) {
  if (!ts) return [];
  return [...rowTimestamps].map(String).filter(t => t > String(ts)).sort();
}

/**
 * ═══ TRẠNG THÁI THỨ TƯ: ĐÃ CÓ ĐỊA CHỈ, ĐANG CHỜ (#182) ══════════════════════
 *
 * Ba trạng thái cũ — mở (`★` khi ≥2) · đã đóng (`✔`) · tái phát (`↻`) — không có chỗ cho
 * *"đã chưng cất thành một việc có địa chỉ, và việc đó đang chờ NGƯỜI KHÁC"*. Không có nó thì
 * nhóm đội `★` mãi và `/harness-retro` đỏ vĩnh viễn trên một việc mà retro đã làm xong phần
 * của nó.
 *
 * Đo 2026-08-11: nhóm `node -e nuốt backtick` (3×) là **#177** — có spec, ba phương án, một
 * khuyến nghị; nó chờ DRI (bản vá nằm trong `.claude/hooks/`, vùng cấm), không chờ retro.
 * Chạy `/harness-retro` lần nữa không sinh ra gì mới, nhưng mục đỏ vẫn nói *"ứng viên bài học
 * ĐANG chờ"* — sai về việc đang chờ ai.
 *
 * VÌ SAO KHÔNG DÙNG `--close`. `--close` nghĩa là **đã sửa tận gốc** (cả hai mục trong sổ đóng
 * đều ghi *"sua tan goc o vX.Y.Z"*). Đóng một việc đang chờ là ghi lời khai sai VÀ xoá dấu vết
 * rằng lỗi còn sống — nhóm đội `✔` trong khi nó vẫn xảy ra hằng ngày. Chính comment của
 * `--close` đã cảnh báo đúng lớp lỗi này một tầng thấp hơn: *một mục đỏ vĩnh viễn dạy người ta
 * bỏ qua màu đỏ*.
 *
 * TÁI PHÁT **KHÔNG** làm nhóm mở lại — khác hẳn `groupStillClosed`, và đây là chỗ dễ chép nhầm
 * nhất. Lý do: `--close` khai *"lỗi này không thể xảy ra nữa"*, nên một mục mới **bác bỏ** lời
 * khai đó. `--track` khai *"tôi biết, nó đây, đang chờ"* — một mục mới **xác nhận** lời khai
 * ấy, và làm issue đắt thêm. Nên số đó đi vào THÔNG ĐIỆP (`recurred`), không đi vào màu.
 */
export function groupTracked(trackedTs, rowTimestamps = []) {
  const recurred = rowsAfter(trackedTs, rowTimestamps);
  return { tracked: Boolean(trackedTs), recurred };
}

/**
 * Nhóm ĐÃ XỬ = đã đóng (và còn đóng), hoặc đã có địa chỉ. **THUẦN**, trả `Set<khoá>`.
 *
 * Một phép trừ, BA bên đọc: `rituals.fixlogState()` (ngưỡng ≥10), `fixlog --list` (cảnh báo
 * ≥10/tuần), và mọi bên đọc sau. Phép trừ này từng chỉ có ở bên thứ nhất — nên `--list` bật
 * cảnh báo với **11 mục** trong khi 5 mục thuộc nhóm đã đóng từ 2026-08-07 và 4 mục thuộc hai
 * nhóm đã có địa chỉ (#177, #160). Số thật sự chưa xử: **2**. Cùng file, cách nhau một lệnh.
 *
 * `groupTracked(ts, [])` — mảng RỖNG là cố ý: ở đây chỉ hỏi *"đã có địa chỉ chưa"*, và tái phát
 * **không** gỡ địa chỉ đó (xem `groupTracked`). Truyền `tss` vào sẽ không đổi kết quả hôm nay,
 * nhưng nó khai sai ý định và mời một bản vá tương lai đọc `recurred` ở đây.
 */
export function handledGroups(groupTimestamps, closed, tracked) {
  const out = new Set();
  for (const [k, tss] of (groupTimestamps ?? new Map())) {
    if (groupStillClosed(closed?.get(k)?.ts, tss).closed || groupTracked(tracked?.get(k)?.ts, []).tracked) out.add(k);
  }
  return out;
}

/**
 * Đọc luật gom nhóm do người khai. TSV `ts \t key \t needle`, giữ NGUYÊN thứ tự file
 * (khi hai luật khớp mà needle DÀI BẰNG NHAU thì luật đầu thắng — xem `fixlogKey`).
 *
 * Đọc được rỗng và đọc lỗi trả về CÙNG một thứ (`[]`) là chấp nhận được ở đây, và chỉ ở đây:
 * không có luật nào thì phép từ vựng cũ vẫn chạy, tức mất phép gom thủ công chứ không mất mục
 * fixlog nào. Đây là suy giảm, không phải mù.
 */
export function fixlogGroupRules() {
  try {
    const f = FIXLOG_GROUPS_FILE();
    if (!existsSync(f)) return [];
    return readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => {
      const [ts, key, ...needle] = l.split('\t');
      return { ts, key, needle: needle.join('\t').trim() };
    }).filter(r => r.key && r.needle);
  } catch { return []; }
}

export const REMOVED_PATHS = [
  {
    path: '.claude/skills/whats-new',
    since: '2.4.0',
    why: 'Thông báo harness đã do `session-start.mjs` in tự động mỗi phiên (đọc `.claude/whats-new.md`). '
      + 'Một skill phải GỌI mới chạy thì không bao giờ được gọi đúng lúc cần — và nó tiêu một suất trong trần skill.',
  },
  {
    path: 'HARNESS-CHANGELOG.md',
    since: '2.14.0',
    why: 'Repo con không đọc nó: `upgrade.mjs` lấy changelog từ `TPL`, không từ cây đang chạy. '
      + '120 KB lịch sử phát triển harness, ghi đè lại mỗi lần nâng cấp, phục vụ không cơ chế nào — '
      + 'và tới 2.13.0 nó còn là một nửa dấu hiệu nhận vai `repoRole()`, tức một file chỉ nên có ở '
      + 'template lại được dùng để trả lời "đây có phải template không" ở nơi nó không nên tồn tại. '
      + 'Thay thế: `.claude/whats-new.md` (SEED, session-start in một lần mỗi version).',
  },
  {
    path: 'harness-migrations',
    since: '2.14.0',
    why: 'Cùng lý do: `upgrade.mjs` đọc `join(TPL, "harness-migrations")`, không bao giờ đọc bản ở repo con. '
      + '92 KB script chỉ chạy từ phía template. `tooling/test-migrations.mjs` vẫn ở lại và tự khai '
      + '`n/a` khi không có migration, nên không có dấu xanh rỗng nào sinh ra từ việc bỏ thư mục này.',
  },
];

/**
 * File có NHIỆM VỤ ghi lại một việc XOÁ — bia mộ ở trên, và migration thi hành nó.
 *
 * `harness-doctor` báo "tham chiếu chết" khi một file nhắc tên skill không tồn tại. Check đó
 * đã loại trừ changelog · whats-new · ADR · learnings vì chúng là **hồ sơ lịch sử**: nhắc tên
 * thứ đã xoá chính là việc của chúng. Cơ chế bia mộ (2.11.0) thêm hai hồ sơ lịch sử nữa,
 * chỉ khác là chúng viết bằng CODE thay vì văn xuôi — nên check không nhận ra, và từ 2.11.0
 * nó báo đỏ VĨNH VIỄN về hai file đang làm đúng việc của mình (đo 2026-08-06: 2/2 tham chiếu
 * còn lại đều thuộc nhóm này, tức mục advice đó 100% dương tính giả).
 *
 * LOẠI TRỪ THEO BẢN CHẤT, KHÔNG THEO TIỆN LỢI — nên nó cần CẢ HAI điều kiện:
 *   · tên phải nằm trong bia mộ (xoá CÓ CHỦ Ý, có version, tra lại được), VÀ
 *   · file phải là nơi ghi việc xoá.
 * Bỏ điều kiện thứ hai thì `docs/TEAM.md` nhắc một skill đã xoá cũng lọt — mà đó đúng là
 * ca check này được viết ra để bắt. Bỏ điều kiện thứ nhất thì migration nhắc bất kỳ tên
 * bịa nào cũng lọt.
 */
/**
 * LỆNH THẬT SỰ ĐÃ KHAI trong `commands` — key `$comment_*` KHÔNG phải lệnh.
 *
 * Ở ĐÂY vì `init.mjs` và `harness-doctor.mjs` cùng hỏi câu này, và cùng trả lời SAI theo
 * đúng một kiểu: `Object.entries(cfg.commands).filter(([, v]) => v.trim())` đếm cả
 * `$comment_a11y_perf` — key duy nhất trong `commands` có giá trị khác rỗng ở template.
 *
 * Hệ quả đo được 2026-08-06: với cấu hình mặc định KHÔNG AI ĐIỀN GÌ, cả hai công cụ báo
 * *"1 lệnh đã khai"*, nên nhánh `!length` không bao giờ chạy — tức dòng cảnh báo to nhất
 * của cả hệ (`commands rỗng — GATE KHÔNG TỒN TẠI ... BẠN là verification loop`) bị một
 * dòng chú thích làm câm, ở MỌI repo áp template, ngay từ phút đầu. Cửa thoát nguy hiểm
 * nhất không phải cửa ai đó mở — mà cửa không ai biết là mình đã đi qua.
 *
 * Quy ước `$comment_*` đã dùng khắp `harness.config.json` (`$comment_migrations`,
 * `$comment_secrets`, `$comment_hot`, …); chỗ này chỉ là nơi duy nhất quên tôn trọng nó.
 */
export function declaredCommands(cfg) {
  return Object.entries(cfg?.commands || {}).filter(([k, v]) => !k.startsWith('$') && v && String(v).trim());
}

export const TOMBSTONE_FILE = /^(tooling\/lib\/harness\.mjs$|harness-migrations\/)/;

/** `.claude/skills/whats-new` → `whats-new`. Chỉ lấy bia mộ LÀ skill; bia mộ khác không liên quan. */
export function removedSkillNames() {
  return new Set(REMOVED_PATHS.map(r => /^\.claude\/skills\/([^/]+)/.exec(r.path)?.[1]).filter(Boolean));
}

/** Tên skill này, ở file này, có phải một việc xoá ĐÃ GHI SỔ không? HÀM THUẦN. */
export function isRecordedRemoval(name, file) {
  return removedSkillNames().has(name) && TOMBSTONE_FILE.test(String(file).split('\\').join('/'));
}

/**
 * LỆCH giữa điều CẤM viết ra và điều guard CƯỠNG CHẾ. HÀM THUẦN, không đọc đĩa.
 *
 * Thuần là điều kiện, không phải sở thích: check này sống trong `harness-doctor`, và
 * `harness-doctor` CHẠY `tooling/test-hooks.mjs` như một bước của nó (dòng 25). Bản đầu của
 * test spawn `harness-doctor` để kiểm hộp đen ⇒ **đệ quy lẫn nhau, suite treo quá 120 giây**.
 * Tách phần phán đoán ra khỏi phần thu thập là đúng bài học `knowledge/lessons/0003` mà
 * `rituals.mjs` đã áp: test khẳng định vào hàm thuần bằng dữ liệu dựng sẵn.
 *
 * @param {object} a
 * @param {string[]} a.enforced  glob mà guard THẬT SỰ chặn (`paths.harness`)
 * @param {string}   a.banText   văn bản điều cấm, ĐÃ gộp dòng tiếp và chuẩn hoá khoảng trắng
 * @param {(p:string)=>boolean} a.matched  đường dẫn này có được cưỡng chế ở đâu đó không
 * @returns {{unspoken:string[], unenforced:string[]}}
 */
export function governanceDrift({ enforced = [], banText = '', matched = () => false }) {
  /** `.claude/hooks/**` → `hooks` · `.claude/settings.json` → `settings.json` · `.github/CODEOWNERS` → `CODEOWNERS` */
  const token = (glob) => {
    const parts = String(glob).replace(/\/\*+$/, '').split('/').filter(p => p && p !== '**' && p !== '*');
    return parts[parts.length - 1] ?? '';
  };
  const live = enforced.filter(g => typeof g === 'string' && g && !g.startsWith('!'));
  const unspoken = live.filter(g => { const t = token(g); return t && !banText.includes(t); });

  const spoken = [...String(banText).matchAll(/`([^`]+)`/g)].map(m => m[1].trim())
    // `/harness-propose` là TÊN SKILL, không phải đường dẫn — và nó có dấu `/` nên một phép
    // lọc `/[/.]/ ` nhận nó vào. Bản đầu báo oan đúng ba mục, cả ba là lỗi PHẠM VI chứ không
    // phải lỗi logic: chỗ cần nhìn trước tiên khi một check kêu oan.
    .filter(p => !/^\/[a-z][a-z0-9-]*$/i.test(p))
    // Đòi dấu `/` HOẶC một đuôi file THẬT. Bản trước chỉ đòi "có dấu chấm" và nó báo oan
    // `paths.harness` — một KHOÁ CONFIG mà chính ghi chú giải thích check nhắc tới. Cùng lớp
    // với *"neo vào CODE, đừng neo vào comment giải thích code"*, đã gặp ba lần ở repo này.
    .filter(p => p.includes('/') || /\.(json|md|mjs|cjs|js|jsx|ts|tsx|ya?ml|toml|sql|sh|ps1|lock|env|pem)$/i.test(p))
    .filter(p => !p.includes(' '));
  const unenforced = spoken.filter(p => !matched(p));
  return { unspoken, unenforced };
}

/**
 * Rút văn bản điều cấm từ một tài liệu markdown: dòng mang điều cấm + MỌI DÒNG TIẾP của
 * cùng mục, rồi chuẩn hoá khoảng trắng.
 *
 * GỘP DÒNG TIẾP LÀ BẮT BUỘC. Bản đầu lọc theo TỪNG DÒNG và báo sai ngay lần thử đầu:
 * `AGENTS.md` gói dòng ở ~110 cột, nên khi danh sách cấm dài ra thành hai dòng thì bốn lớp
 * ĐANG NẰM TRONG FILE bị báo là thiếu. `fleet/.claude/scripts/claude-md-budget.mjs` đã ghi
 * lại đúng ca này trước đó: *"three prohibitions reported missing while all three sat in the
 * file, wrapped. A check that answers 'missing' for something present is worse than no check,
 * because its output looks like a finding."* — đọc rồi vẫn đi vào, nên nó được ghi ở đây.
 */
export function prohibitionText(markdown, re = /KHÔNG\s+(được\s+)?sửa/i) {
  const lines = String(markdown).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!re.test(lines[i])) continue;
    out.push(lines[i]);
    for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]) && !/^\s*[-*]\s/.test(lines[j]); j++) {
      out.push(lines[j]);
    }
  }
  return out.join(' ').replace(/\s+/g, ' ');
}

export const MECHANISM_PATHS = [
  '.claude/hooks', '.claude/skills', '.claude/agents',
  'tooling/lib', 'tooling/knowledge', 'tooling/fixtures',
  'tooling/init.mjs', 'tooling/test-hooks.mjs', 'tooling/test-migrations.mjs',
  'tooling/apply-to.mjs', 'tooling/upgrade.mjs', 'tooling/gates.mjs', 'tooling/setup.mjs',
  'tooling/fixlog.mjs', 'tooling/coactivity.mjs', 'tooling/harness-size.mjs',
  'tooling/capo-report.mjs', 'tooling/harness-doctor.mjs', 'tooling/doctor.mjs',
  'tooling/entropy-scan.mjs', 'tooling/rituals.mjs',
  'tooling/check-reservations.mjs', 'tooling/check-feature-integrity.mjs', 'tooling/overlap-scan.mjs',
  'tooling/wt-clean.mjs', 'tooling/statusline.mjs', 'tooling/precommit-scan.mjs',
  'tooling/native-surface.mjs',
  '.githooks', 'evals/run.mjs', 'evals/fixtures',
  'tooling/test-evals.mjs',
  // `harness.version` Ở LẠI: repo con ĐỌC nó (`harness-doctor` in version; `upgrade` so
  // khoảng version để biết chạy migration nào). Hai thứ từng đứng cạnh nó thì KHÔNG — xem
  // `NOT_FOR_CONSUMER` ngay dưới.
  'harness.version',
];

/**
 * TRÔNG như cơ chế, nhưng repo con KHÔNG ĐỌC — nên không đi xuống.
 *
 * `HARNESS-CHANGELOG.md` (120 KB) và `harness-migrations/` (92 KB — đo ở một repo con thật,
 * 2026-08-06). `upgrade.mjs` đọc CẢ HAI từ `TPL`, tức bản template mà người dùng trỏ tới
 * bằng `--from`, chứ không từ cây đang chạy:
 *
 *     const changelogPath = join(TPL, 'HARNESS-CHANGELOG.md');
 *     const migDir        = join(TPL, 'harness-migrations');
 *
 * Hướng dẫn cuối `upgrade.mjs` cũng viết "đọc HARNESS-CHANGELOG.md CỦA TEMPLATE". Nên tới
 * 2.13.0 đây là ~210 KB lịch sử phát triển harness, **ghi đè lại ở MỖI lần nâng cấp**, phục
 * vụ không cơ chế nào ở phía nhận.
 *
 * Changelog còn tệ hơn "thừa": tới 2.13.0 nó là một nửa dấu hiệu nhận vai trong `repoRole()`.
 * Một file chỉ nên có ở template lại có mặt ở mọi repo con, và nó được dùng để trả lời câu
 * "đây có phải template không". Xem lý do đầy đủ ở `repoRole`.
 *
 * Repo con muốn biết harness đổi gì thì đọc `.claude/whats-new.md` — SEED sinh ra đúng cho
 * việc đó, và `session-start` in nó một lần mỗi version.
 *
 * `tooling/test-migrations.mjs` VẪN ship: nó đã tự khai `n/a — không có migration nào để
 * test` khi thư mục vắng, nên nó không biến thành một dấu xanh rỗng.
 */
export const NOT_FOR_CONSUMER = ['HARNESS-CHANGELOG.md', 'harness-migrations'];

/**
 * Dòng nào trong `required` chưa có trong `text`. So khớp sau khi trim, theo DÒNG
 * NGUYÊN VẸN — không phải `includes`: `.claude/state/` là chuỗi con của
 * `!.claude/state/keep.json`, và một phép `includes` sẽ coi dòng phủ định là "đã có".
 */
export function missingLines(text, required) {
  const have = new Set(String(text).split('\n').map(l => l.trim()));
  return required.filter(l => !have.has(l));
}

// ─────────────────────────────────────────────────────────────────────────────
// Telemetry (cá nhân, gitignore) — nguyên liệu của vòng học
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trạng thái cục bộ, không commit (`.claude/state/`): "đã xem whats-new version nào",
 * "phiên trước dừng vì lỗi gì". Khác `telemetry/`: đây là trạng thái ĐỌC-GHI, không
 * phải log append-only.
 *
 * `HARNESS_STATE_DIR` chuyển đích. CHỈ dùng cho TEST, và cũng bắt buộc như dòng dưới:
 * `test-hooks.mjs` spawn `session-start.mjs` thật, và nếu nó ghi vào state THẬT thì
 * mỗi lần chạy suite sẽ **ăn mất thông báo `.claude/whats-new.md` của chính bạn** — cơ chế đó
 * cố ý chỉ in MỘT LẦN cho mỗi version, nên "đã in rồi" là trạng thái không lấy lại được.
 */
export function stateDir() {
  const d = process.env.HARNESS_STATE_DIR || repoPath('.claude', 'state');
  try { mkdirSync(d, { recursive: true }); } catch {}
  return d;
}

/**
 * ═══ STATE DÙNG CHUNG CHO MỌI WORKTREE CỦA CÙNG MỘT REPO ════════════════════
 *
 * `stateDir()` neo vào `REPO_ROOT`, mà `REPO_ROOT` suy từ vị trí file ⇒ **trong worktree nó là
 * gốc worktree**. Đúng cho hầu hết state (thứ nào thuộc về CÂY LÀM VIỆC thì ở lại cây đó).
 * SAI cho một thứ: **sổ phiên**.
 *
 * Đo 2026-08-07/08 (issue #108): ba phiên Claude chạy song song trên cùng repo suốt ~2 giờ.
 * `.claude/state/sessions/` chỉ có **một** file — phiên này. Hai phiên kia ở worktree riêng nên
 * ghi vào sổ riêng của chúng. Không phiên nào thấy phiên nào, và **không cảnh báo nào bật**.
 * Người dùng phát hiện ra bằng *cảm giác hoá đơn*, không bằng một dòng báo.
 *
 * `overlap-scan` không lấp được: nó đối chiếu với **PR đang mở**, nên một phiên chưa push là
 * vô hình với nó.
 *
 * CÁI GIÁ, đo được cùng ngày: **3 lần rebase** (2 lần conflict phải hợp tay), eval cho **3 kết
 * quả khác nhau trên cùng một code** vì tranh máy, và **một lần chẩn đoán trùng**. Không cái
 * nào là "hai agent hiểu nhầm nhau" — chúng **không có kênh nào để nói chuyện**. Toàn bộ là
 * chi phí VA CHẠM, và va chạm phát hiện được thì tránh được.
 *
 * `git rev-parse --git-common-dir` trỏ về `.git` của cây CHÍNH từ mọi worktree, nên nó là chỗ
 * duy nhất mọi phiên cùng nhìn thấy. Nằm trong `.git` ⇒ không bao giờ bị commit, không cần
 * thêm dòng nào vào `.gitignore`.
 */
export function resolveSharedState(commonDirRaw, repoRoot) {
  // Cây chính: git trả `.git` (TƯƠNG ĐỐI). Worktree phụ: git trả đường dẫn TUYỆT ĐỐI tới `.git`
  // của cây chính. Không phân biệt hai ca này thì worktree phụ tạo `<wt>/<abs>` — một đường dẫn
  // vô nghĩa, và mỗi worktree lại có sổ riêng đúng như bug đang sửa.
  const raw = String(commonDirRaw || '').trim() || '.git';
  const common = /^([A-Za-z]:[\\/]|[\\/])/.test(raw) ? raw : join(repoRoot, raw);
  return join(common, 'harness-shared');
}

/** Phần IO của `resolveSharedState`. */
export function sharedStateDir() {
  if (process.env.HARNESS_STATE_DIR) return stateDir();   // test lái được, và lái CẢ HAI cùng lúc
  let raw = '';
  try { const r = git(['rev-parse', '--git-common-dir']); if (r.status === 0) raw = r.stdout; } catch {}
  const d = resolveSharedState(raw, REPO_ROOT);
  try { mkdirSync(d, { recursive: true }); } catch {}
  return d;
}

/**
 * `HARNESS_TELEMETRY_DIR` chuyển đích ghi telemetry. CHỈ dùng cho TEST — và nó là
 * bắt buộc, không phải tiện nghi.
 *
 * `tooling/test-hooks.mjs` spawn hook thật với cwd là repo thật, nên mỗi lần chạy
 * suite nó ghi hàng chục dòng `gate-fails` vào telemetry THẬT. Sau vài tuần,
 * "hook này chặn 267 lần" gần như toàn bộ là **suite tự gọi chính nó** — và con số
 * đó là đầu vào của `/harness-retro` bước 4, chỗ bắt buộc đề xuất CẮT BỎ.
 * Một bộ đếm bị chính test của nó làm nhiễu là bộ đếm nói dối về hướng nguy hiểm.
 */
/**
 * PHỄU DUY NHẤT của mọi đường ghi telemetry. Vì vậy mệnh đề `fixture-` nằm ở ĐÂY.
 *
 * Đo 2026-08-07 (`/harness-retro` §3): 2 trong 6 mục của `gate-fails.log` mang project id
 * của FIXTURE (`fixture-guard-paths`, `fixture-lint-fails`) — tức không phải công việc thật
 * bị chặn. Tổng 6 lần chặn từ trước tới nay thật ra là: **1 cứu thật · 3 dương tính giả ·
 * 2 rác**. Mà cột `N qua · M chặn` chính là thứ `/harness-retro` bước 1 dặn đọc TRƯỚC, và
 * bước 4 dùng để quyết định CẮT cái gì.
 *
 * SUITE THÌ SẠCH — đã đo: chạy `test-hooks` + `test-evals`, log thật giữ nguyên 6 → 6 dòng.
 * `TEST_ENV` có `HARNESS_TELEMETRY_DIR` và `mutate()` truyền nó xuống. Nguồn rò là **probe
 * hook BẰNG TAY lúc phát triển**: chạy hook với `HARNESS_CONFIG` trỏ fixture rồi quên chuyển
 * đích. Suite có kỷ luật; probe tay thì không — và probe tay đúng là thứ người ta làm khi
 * đang viết một hook.
 *
 * CHUYỂN HƯỚNG, KHÔNG VỨT. Dữ liệu vẫn được ghi, chỉ là vào đích của test. Vứt im lặng
 * biến một cơ chế thành vô hình, và đó là lớp lỗi `block()` đã đóng ở v2.17.0.
 *
 * Đây là một mệnh đề, không phải một lời nhắc — cùng lý do với `block()` tự ghi sổ:
 * `danger-zones.md` đã viết sẵn câu trả lời cho dạng "nhớ set biến môi trường":
 * *"mọi thứ chỉ tồn tại dưới dạng lời nhắc sẽ bị bỏ qua bởi người đang gấp,
 * và người đang gấp luôn tồn tại."*
 *
 * ĐÁNH ĐỔI, nói rõ: một project THẬT tên `fixture-…` sẽ bị chuyển hướng nhầm. `setup.mjs`
 * suy `project.id` từ tên thư mục, nên điều đó có thể xảy ra. Chấp nhận: hỏng theo chiều
 * "telemetry của bạn nằm ở tmpdir" thì thấy ngay khi `harness-doctor` báo 0 bằng chứng;
 * hỏng theo chiều ngược lại thì bộ đếm nói dối âm thầm và không ai biết.
 */
export function telemetryDir() {
  let d = process.env.HARNESS_TELEMETRY_DIR;
  if (!d) {
    let id = '';
    try { id = String(config().project?.id || ''); } catch {}
    d = id.startsWith('fixture-') ? TEST_TELEMETRY_DIR : repoPath('.claude', 'telemetry');
  }
  try { mkdirSync(d, { recursive: true }); } catch {}
  return d;
}

/**
 * ĐÍCH mà `test-hooks.mjs` chuyển telemetry/state sang. Ở ĐÂY vì có HAI nơi dùng nó,
 * và hai nơi đó phải trỏ cùng một chỗ hoặc cả cơ chế im lặng mất tác dụng:
 *
 *   · `test-hooks.mjs` GHI vào đây (qua `HARNESS_TELEMETRY_DIR`).
 *   · `harness-doctor` ĐỌC ở đây, như nguồn BẰNG CHỨNG THỨ HAI cho câu hỏi
 *     "hook này có thật sự chạy không, hay nó crash im lặng?".
 *
 * Hằng số này viết tay ở hai file thì lệch nhau là chuyện của thời gian, và khi lệch
 * thì doctor đọc một thư mục rỗng rồi kết luận "chưa có bằng chứng" về 9 cái gác
 * vừa chạy xong ngay trong cùng một lần chạy của chính nó. Sai lặng lẽ, không đỏ.
 *
 * NHƯNG *"hai tiến trình thoả thuận được đường dẫn"* KHÔNG đồng nghĩa *"mọi tiến trình trên
 * máy dùng chung một đường dẫn"*. Một cái tên cố định làm cả hai việc cùng lúc, và việc thứ
 * hai là một cuộc đua. Đo 2026-08-08 (#100): chạy TUẦN TỰ 6 lần ⇒ 6 lần xanh; chạy HAI suite
 * SONG SONG ⇒ **cả hai đỏ ngay lần đầu**, mỗi bên một tập ca khác nhau. `AGENTS.md` cho phép
 * nhiều session cùng máy, nên đây là cấu hình thường, không phải ca hiếm.
 *
 * Cách tách hai việc: đường dẫn theo LẦN CHẠY, và cha GHIM id đó xuống con qua env.
 *   · chạy thẳng `test-hooks.mjs`  → id = pid của chính nó  ⇒ hai lần chạy không giẫm nhau
 *   · `harness-doctor` spawn suite → id = pid của DOCTOR    ⇒ cha đọc đúng chỗ con vừa ghi
 *
 * PID được hệ điều hành dùng lại sau khi tiến trình chết, nên một thư mục cũ có thể trùng tên.
 * Điều đó KHÔNG được vá ở đây, vì đã có lớp khác lo và hai lớp cùng hướng thì mạnh hơn một:
 * `tallyLines({ sinceMs })` chỉ đếm dòng SINH RA TRONG lần chạy hiện tại (xem ④ ở
 * `test-hooks.mjs`). Bằng chứng cũ trùng pid vẫn đọc là `?`, không đọc thành `ok`.
 */
export const TEST_RUN_ID = process.env.HARNESS_TEST_RUN_ID || String(process.pid);
const TEST_RUN_DIR = join(tmpdir(), `harness-test-run-${TEST_RUN_ID}`);
/** Mọi trạng thái tạm của một lần chạy suite phải đi qua đây — xem chú thích trên. */
export const testRunPath = (name) => join(TEST_RUN_DIR, name);
export const TEST_TELEMETRY_DIR = testRunPath('harness-test-telemetry');
export const TEST_STATE_DIR = testRunPath('harness-test-state');

/**
 * Dọn thư mục lần-chạy đã cũ.
 *
 * Trước #100 chỉ có MỘT thư mục dùng lại mãi mãi, nên không ai phải dọn. Một thư mục cho mỗi
 * lần chạy đổi điều đó: không dọn thì `tmpdir()` phình theo số lần chạy suite, và trên máy này
 * đĩa đã từng đầy thật.
 *
 * Ngưỡng để RỘNG (24h) là chủ ý, không phải lười: mục tiêu là chặn tích luỹ vô hạn, không phải
 * dọn sớm nhất có thể. Một suite ĐANG chạy tuyệt đối không được bị xoá thư mục dưới chân, mà từ
 * bên ngoài ta không biết pid nào đang chạy — nên hỏng về phía "dọn muộn", không phải phía
 * "dọn nhầm của người đang làm việc".
 */
export function sweepStaleTestRuns({ maxAgeMs = 24 * 60 * 60 * 1000, now = Date.now() } = {}) {
  let removed = 0;
  let base;
  try { base = readdirSync(tmpdir()); } catch { return 0; }   // không đọc được tmpdir: không phải việc của suite
  for (const name of base) {
    if (!name.startsWith('harness-test-run-')) continue;
    const p = join(tmpdir(), name);
    try {
      if (now - statSync(p).mtimeMs < maxAgeMs) continue;
      rmSync(p, { recursive: true, force: true });
      removed++;
    } catch { /* tiến trình khác đang giữ, hoặc vừa bị xoá — cả hai đều không phải lỗi */ }
  }
  return removed;
}

/**
 * Đếm dòng telemetry theo khoá — HÀM THUẦN trên TEXT, không đọc đĩa.
 *
 * `sinceMs` là thứ khiến hàm này đáng tách ra. `harness-doctor` dùng telemetry của suite làm
 * bằng chứng "hook chạy được, không crash im lặng" — nhưng thư mục đó nằm ở `tmpdir()` và
 * SỐNG DAI hơn một lần chạy. Không lọc theo thời gian thì một lần chạy suite hôm qua vẫn đọc
 * là "suite ✓" hôm nay, kể cả khi hôm nay suite KHÔNG chạy, chạy hỏng, hay bị ai đó gỡ khỏi
 * danh sách check. Tức là đúng lúc bằng chứng cần nói "tôi không biết" thì nó nói "ổn".
 *
 * Lọc theo mốc bắt đầu của tiến trình đang hỏi ⇒ "suite ✓" chỉ có nghĩa **hook này đã được
 * spawn thành công TRONG chính lần chạy này**. Và nó hỏng về phía an toàn: đảo thứ tự các
 * bước trong doctor thì bằng chứng biến mất thành `?`, không biến thành một lời khẳng định sai.
 *
 * Dấu thời gian không đọc được ⇒ KHÔNG đếm khi có `sinceMs`. "Không biết dòng này từ bao giờ"
 * là `?`, và một `?` không được cộng vào một con số.
 */
export function tallyLines(text, { field = 2, sinceMs = 0 } = {}) {
  const m = new Map();
  for (const line of String(text).split('\n')) {
    const p = line.split('|');
    if (p.length < field + 2) continue;
    // Dòng ĐÓNG là siêu dữ liệu về cái sổ, không phải một lần hook chạy. Đếm nó vào danh mục
    // hook sẽ đẻ ra một "hook" tên `__CLOSED__` chưa từng tồn tại.
    if (p[2] === TELEMETRY_CLOSED) continue;
    if (sinceMs) {
      const t = Date.parse(p[0]);
      if (!Number.isFinite(t) || t < sinceMs) continue;
    }
    const key = p[field], sub = p[field + 1];
    const e = m.get(key) ?? {};
    e[sub] = (e[sub] ?? 0) + 1;
    m.set(key, e);
  }
  return m;
}

/**
 * ═══ VERSION ĐÃ PHÁT HÀNH MÀ KHÔNG AI PIN ĐƯỢC ═══════════════════════════════
 *
 * **THUẦN**. `harness-doctor` đã có một check về tag, và nó hỏi: *"tag đang có có trỏ vào thứ
 * nằm trên main không?"* — hữu ích, nhưng nó **chỉ hỏi một chiều**. Dòng xanh nó in ra
 * (*"72 tag phát hành đều nằm trên main"*) đọc như một lời khai về PHÁT HÀNH, trong khi nó
 * không biết gì về version **không có tag nào**.
 *
 * Đo 2026-08-12: tag mới nhất là **v2.45.1**, `harness.version` trên main là **2.67.0**. Tức
 * **22 version** đã merge mà không pin được — trong khi `knowledge/README.md` viết rõ *"repo
 * khác pin theo tag/sha, **không bao giờ** theo `main`"*, và `upgrade.mjs --ref <tag>` là đường
 * duy nhất làm điều đó. Cơ chế chuyển giao có đủ mọi thứ trừ cái mốc để trỏ vào.
 *
 * ĐO KHOẢNG CÁCH, ĐỪNG LIỆT KÊ HẾT. 37 version không tag, nhưng consumer chỉ pin được cái MỚI
 * NHẤT — nên con số hành động được là *"main đi trước tag mới nhất bao nhiêu version"*. Một
 * danh sách 37 mục là một mục đỏ không ai xử nổi; một con số kèm một cái tên thì xử được.
 *
 * So sánh bằng SỐ, không bằng chuỗi: `2.9.0` > `2.10.0` theo thứ tự từ vựng, và một phép so
 * sai ở đây báo "không có gì trễ" đúng lúc có.
 */
/**
 * SO HAI VERSION — THUẦN, và `null` khi KHÔNG SO ĐƯỢC.
 *
 * Phép so này ra đời khoá bên trong `releaseTagGap()`. Nó được kéo ra đây vì nghi thức
 * `claude-code-drift` cần đúng nó, và bản đầu của nghi thức dùng `!==` — **một phép so KHÔNG
 * CÓ CHIỀU**.
 *
 * Hậu quả, đo 2026-08-13: máy này chạy Claude Code `2.1.222` trong khi sổ đã rà tới `2.1.228`
 * (máy khác ghi, và sổ đó ĐƯỢC COMMIT). Nghi thức in *"đã đổi 2.1.228 → 2.1.222: đọc changelog
 * bản mới"* — `2.1.222` là bản CŨ HƠN, không có changelog nào chưa đọc. Việc đúng là KHÔNG LÀM
 * GÌ, nhưng bảng báo có việc. Cùng lớp lỗi với `#194` (check tag chỉ hỏi một chiều).
 *
 * Để hai bản chép thì chúng trôi khỏi nhau — đúng điều `codeScanDesync` và `handledGroups`
 * tồn tại để chặn. Một bản thì không trôi được.
 *
 * **`null` chứ không phải `0`.** "Không đọc được dạng số" và "hai version bằng nhau" là hai
 * câu khác hẳn nhau; gộp chúng thì một chuỗi rác đọc thành *"không có drift"*. Bên gọi phải
 * xử `null` TRƯỚC khi so với 0 — trong JS `null <= 0` là `true`, nên bỏ qua nó là im lặng.
 */
export function versionCmp(a, b) {
  const parse = (v) => String(v).replace(/^v/, '').split('.').map(Number);
  const valid = (p) => p.length === 3 && p.every(Number.isFinite);
  const [pa, pb] = [parse(a), parse(b)];
  if (!valid(pa) || !valid(pb)) return null;
  return (pa[0] - pb[0]) || (pa[1] - pb[1]) || (pa[2] - pb[2]);
}

export function releaseTagGap({ versions = [], tags = [], current = '' } = {}) {
  const parse = (v) => String(v).replace(/^v/, '').split('.').map(Number);
  const valid = (p) => p.length === 3 && p.every(Number.isFinite);
  // Mọi chuỗi tới `versionCmp` dưới đây đã qua `valid()` ở trên, nên không ca nào ra `null`.
  const cmp = (a, b) => versionCmp(a, b);

  const cur = parse(current);
  if (!valid(cur)) return null;                       // không đọc được `harness.version` ⇒ `?`
  const tagged = new Set(tags.map(t => String(t).replace(/^v/, '')));
  const rel = versions.map(String).filter(v => valid(parse(v)));
  if (!rel.length) return null;                       // không đọc được changelog ⇒ `?`

  const tagList = [...tagged].filter(t => valid(parse(t))).sort((a, b) => cmp(a, b));
  const latestTag = tagList.at(-1) ?? null;
  // "Đã phát hành" = có mục changelog và KHÔNG mới hơn version đang ở trên main. Dùng phép so
  // này chứ không grep commit message: hai version từng ra trong CÙNG một commit (v2.54/v2.55),
  // nên grep gán nhầm mốc — và một cái tag đặt nhầm chỗ tệ hơn hẳn một cái tag thiếu.
  const untagged = rel.filter(v => !tagged.has(v) && cmp(v, current) <= 0)
    .sort((a, b) => cmp(a, b));
  const behind = latestTag ? untagged.filter(v => cmp(v, latestTag) > 0).length : untagged.length;
  // `current` chỉ để HIỂN THỊ. Bản 2.67.0 viết chỗ này thành
  //   `rel.includes(…) ? String(current) : String(current)`
  // — hai nhánh giống hệt nhau, nên điều kiện chưa bao giờ quyết định gì. Kết quả vẫn đúng,
  // nhưng nó ĐỌC như một phép phân biệt có thật, và người sửa sau sẽ đi tìm ca thứ hai không
  // tồn tại. Cùng họ với mọi thứ trong lô `verdict`: một phép tính không xảy ra, im lặng.
  return { latestTag, current: String(current), behind, untagged };
}

/**
 * ═══ MA SÁT ĐO ĐƯỢC: CÔNG CỤ HỎNG + CHỜ NGƯỜI (#132) ═════════════════════════
 *
 * Hai ô native (`PostToolUseFailure`, `Notification`) là tầng CAPTURE mà `fixlog` đang phải
 * làm bằng trí nhớ người. **THUẦN** — nhận TEXT, không đọc đĩa.
 *
 * VÌ SAO CÓ HÀM NÀY CHỨ KHÔNG CHỈ CÓ CÁI HOOK: một cơ chế ghi mà không ai đọc là thứ
 * `/harness-retro` bước 4 phải cắt — và lô trước vừa đo được đúng một ca như thế (cảnh báo mềm
 * `package.json` trong `dcg`, in ra nhưng không tới được ai). Cắm ô mà không có bên đọc là tự
 * tạo ra mục tiếp theo của danh sách cắt bỏ.
 *
 * BA CON SỐ, KHÔNG PHẢI MỘT — và ranh giới giữa chúng là toàn bộ giá trị:
 *
 *   errors      công cụ THẬT SỰ hỏng
 *   interrupts  NGƯỜI bấm dừng (`is_interrupt`) — một quyết định, không phải một lỗi
 *   idle        số lần agent chờ người VƯỢT NGƯỠNG
 *
 * Gộp `interrupts` vào `errors` cho ra câu *"công cụ này hay hỏng"* trong khi sự thật là
 * *"tôi hay bấm dừng nó"* — `L0005`, phía dễ chịu.
 *
 * `idle` KHÔNG PHẢI THỜI LƯỢNG, và chỗ này dễ đọc sai nhất. Vendor bắn `idle_prompt` khi thời
 * gian chờ vượt `messageIdleNotifThresholdMs` — một ngưỡng NGƯỜI DÙNG chỉnh được — và sự kiện
 * **không mang thời lượng** (đo từ binary 2.1.228: `{ message, title?, notification_type }`).
 * Nên nó đọc được XU HƯỚNG trên cùng một máy, và **không so được giữa hai máy**. Cùng hình dạng
 * với CAPO-TRẦN của gói phẳng: một tỉ lệ chỉ có nghĩa so với chính nó.
 *
 * `null` (không đọc được) ≠ `''` (đọc được, rỗng). Chưa cắm ô thì `wired=false` ⇒ `n/a`, vì
 * "chưa hỏi" không được đọc thành "không có gì".
 */
export function frictionReading({ failures = null, notifications = null, wired = false, now = Date.now(), days = 7 } = {}) {
  const base = { mode: 'not-wired', days, errors: null, interrupts: null, idle: null, notifs: null, top: null };
  if (!wired) return base;
  if (failures === null || notifications === null) return { ...base, mode: 'unmeasured' };

  const sinceMs = now - days * 86400000;
  const byTool = tallyLines(failures, { field: 2, sinceMs });
  let errors = 0, interrupts = 0;
  const top = [];
  for (const [tool, subs] of byTool) {
    const e = Number(subs.error) || 0, n = Number(subs.interrupt) || 0;
    errors += e; interrupts += n;
    top.push({ tool, errors: e, interrupts: n });
  }
  top.sort((a, b) => (b.errors - a.errors) || (b.interrupts - a.interrupts));

  const byType = tallyLines(notifications, { field: 2, sinceMs });
  let notifs = 0;
  for (const subs of byType.values()) for (const n of Object.values(subs)) notifs += Number(n) || 0;
  const idleSubs = byType.get('idle_prompt') ?? {};
  const idle = Object.values(idleSubs).reduce((s, n) => s + (Number(n) || 0), 0);

  return { mode: 'measured', days, errors, interrupts, idle, notifs, top: top.slice(0, 3) };
}

/**
 * ═══ BA BỘ ĐẾM TỪ BA Ô NATIVE (#135 · #136 · #137) ═══════════════════════════
 *
 * **THUẦN** — nhận TEXT, không đọc đĩa. Mỗi con số trả lời một câu hỏi mà trước đó harness
 * chỉ SUY được:
 *
 *   skills   `/entropy-sweep` cắt skill bằng phép ĐẾM (`12/12`) vì nó chưa từng có dữ liệu
 *            skill nào được gọi. Suy gián tiếp từ artefact sai được: skill chạy rồi bỏ giữa
 *            chừng không để lại gì.
 *   agents   `AGENTS.md` đặt trần <5s ở `SubagentStop` vì *"nhân với tối đa 16 agent song
 *            song"* — con số 16 CHƯA AI ĐO.
 *   denied   harness đếm được guard của CHÍNH NÓ, không có số nào cho lần vendor chặn.
 *
 * ── HAI RANH GIỚI, VÀ CẢ HAI ĐỀU LÀ CHỖ MỘT CON SỐ SẼ NÓI DỐI
 *
 * ① `maxConcurrent` cần CẢ start LẪN stop. Đếm start rồi gọi nó là "đồng thời" là phép gộp
 *    sai: 40 lần khởi động rải rác một tuần không phải 40 agent cùng lúc. Hàm này dựng lại
 *    đường cong bằng cách duyệt hai loại mốc theo thứ tự thời gian; thiếu `stop` thì con số
 *    chỉ có thể LỚN HƠN sự thật, nên nó trả kèm `unpaired` để chỗ in nói ra điều đó.
 *
 * ② `denied` phải TÁCH theo `reason`. Tập giá trị của vendor có cả `hook` — tức lần chặn của
 *    CHÍNH TA. Gộp nó vào "vendor chặn việc thật" là tự đếm mình hai lần, và thổi phồng đúng
 *    con số đang định dùng để tranh luận (`L0005`).
 */
export function slotCounters({ skills = null, agents = null, denied = null, now = Date.now(), days = 7 } = {}) {
  const sinceMs = now - days * 86400000;
  const out = { days, skills: null, agents: null, denied: null };

  if (skills !== null) {
    const byName = tallyLines(skills, { field: 2, sinceMs });
    const rows = [...byName].map(([name, subs]) => ({ name, calls: Object.values(subs).reduce((s, n) => s + (Number(n) || 0), 0) }));
    rows.sort((a, b) => b.calls - a.calls);
    // ĐO ĐƯỢC GÌ — và quan trọng hơn, KHÔNG đo được gì.
    //
    // Sổ `skill-calls` do ô `UserPromptExpansion` ghi, và ô đó chỉ bắn khi NGƯỜI GÕ một lệnh
    // gạch chéo. Đo trực tiếp 2026-08-13: gọi skill bằng công cụ `Skill` (model tự gọi) KHÔNG
    // tạo mục nào — sổ `skill-calls.log` thậm chí không được tạo ra. Đã loại trừ hai nguyên
    // nhân dễ đổ lỗi: ô CÓ đăng ký trong `settings.json`, và `native-surface` xác nhận sự kiện
    // CÓ trong binary (31 sự kiện, tập không đổi so với lần ghi 2.1.228).
    //
    // Nên `total: 0` KHÔNG có nghĩa *"không skill nào được dùng"*. Và `/entropy-sweep` đọc đúng
    // con số này để **đề xuất BỎ** skill không được dùng: một điểm mù đo lường nuôi một quyết
    // định XOÁ. `blindTo` đi kèm con số để không bên tiêu thụ nào đọc nó mà không thấy giới hạn
    // — cùng lý do `nativeSlotState` trả `null` thay vì `0`.
    out.skills = {
      distinct: rows.length,
      total: rows.reduce((s, r) => s + r.calls, 0),
      top: rows.slice(0, 3),
      blindTo: 'skill do model tự gọi (công cụ Skill) — ô UserPromptExpansion chỉ thấy lệnh NGƯỜI GÕ',
    };
  }

  if (agents !== null) {
    // Duyệt theo THỜI GIAN, không theo tổng: `+1` ở mỗi `start`, `-1` ở mỗi `stop`, và đỉnh của
    // đường cong đó mới là "đồng thời". Dòng hỏng (thiếu cột) bị bỏ qua, không đoán.
    const evs = [];
    for (const line of String(agents).split('\n')) {
      const p = line.split('|');
      if (p.length < 4) continue;
      const t = Date.parse(p[0]);
      if (!Number.isFinite(t) || t < sinceMs) continue;
      if (p[3] !== 'start' && p[3] !== 'stop') continue;
      evs.push({ t, kind: p[3], type: p[2] });
    }
    evs.sort((a, b) => a.t - b.t);
    let live = 0, peak = 0, starts = 0, stops = 0;
    const types = new Set();
    for (const e of evs) {
      if (e.kind === 'start') { live++; starts++; types.add(e.type); if (live > peak) peak = live; }
      else { stops++; if (live > 0) live--; }
    }
    out.agents = { starts, stops, peak, unpaired: Math.max(0, starts - stops), types: types.size };
  }

  if (denied !== null) {
    const byTool = tallyLines(denied, { field: 2, sinceMs });
    let vendor = 0, ours = 0;
    const rows = [];
    for (const [tool, subs] of byTool) {
      let v = 0, o = 0;
      for (const [reason, n] of Object.entries(subs)) {
        const c = Number(n) || 0;
        if (reason === 'hook') o += c; else v += c;
      }
      vendor += v; ours += o;
      rows.push({ tool, vendor: v, ours: o });
    }
    rows.sort((a, b) => b.vendor - a.vendor);
    out.denied = { vendor, ours, top: rows.slice(0, 3) };
  }
  return out;
}

/**
 * ═══ CONTEXT ĐÃ BIẾN MẤT SAU LẦN GHI NHẬT KÝ GẦN NHẤT CHƯA (#130) ════════════
 *
 * **THUẦN**. `lossAt` = mốc `PreCompact`/`SessionEnd` gần nhất (do `observe.mjs` ghi);
 * `progressAt` = lần cuối `docs/progress/<issue>.md` được sửa.
 *
 * VÌ SAO PHÉP SO NÀY LÀ CƠ CHẾ, KHÔNG PHẢI MỘT DÒNG THÔNG TIN: `/handoff` là thủ công và
 * `rituals` đo được nó **chưa chạy lần nào** kể từ khi harness ra đời. Một mốc mất context nằm
 * SAU lần ghi nhật ký cuối nghĩa là **đã có một quãng làm việc không ai ghi lại** — và đó là
 * đúng câu hỏi `/handoff` sinh ra để hỏi, chỉ khác là trước giờ không có dữ kiện để hỏi nó.
 *
 * `null` ở BẤT KỲ vế nào ⇒ `null` (không đo được), KHÔNG phải `false`. Chưa có mốc mất context
 * và "có mốc nhưng nhật ký mới hơn" là hai chuyện khác nhau: cái đầu nghĩa là chưa nhìn thấy
 * lần nén nào, cái sau là một câu trả lời thật.
 */
export function contextLossPending(lossAt, progressAt, now = Date.now()) {
  const loss = Date.parse(lossAt ?? '');
  if (!Number.isFinite(loss)) return null;
  const ageHours = Math.max(0, Math.round((now - loss) / 3600000));
  const prog = Date.parse(progressAt ?? '');
  // Không có nhật ký ⇒ mốc mất context KHÔNG thể "cũ hơn" nó ⇒ đang treo. Đây là ca thường gặp
  // nhất ở một nhánh chưa ai chạy `/claim`, và trả `false` ở đó là bỏ sót đúng nhóm cần nhắc.
  if (!Number.isFinite(prog)) return { pending: true, ageHours, hasProgress: false };
  return { pending: loss > prog, ageHours, hasProgress: true };
}

/**
 * ═══ "TỰ KHEN": passes=true MÀ KHÔNG CÓ BẰNG CHỨNG (#131) ════════════════════
 *
 * **THUẦN**, không đọc đĩa. Trả danh sách tiêu chí đang khai ĐẠT mà `evidence` rỗng.
 *
 * `README` gọi *"agent tự khen, mark done sớm"* là vấn đề trung tâm, và `AGENTS.md
 * §Verification` viết luật ra rồi: *"`evidence` bắt buộc khi `passes: true` … 'Tôi đã kiểm tra'
 * KHÔNG phải bằng chứng"*. Luật đó đang được cưỡng chế ở `check-feature-integrity.mjs` — tức ở
 * **CI**, tức SAU khi agent đã tin là nó xong.
 *
 * Tách ra `lib` để `TaskCompleted` hỏi được CÙNG câu hỏi ở CÙNG định nghĩa. Hai bản chép của
 * một luật là hình dạng chính xác của #125, và ở đây nó còn tệ hơn: hai bên sẽ bất đồng về
 * việc *"đã xong chưa"*, câu hỏi đắt nhất trong repo.
 *
 * `a11y`/`perf` là ANH EM của `platforms`, không nằm trong nó — bỏ sót chúng là lỗ đã có thật
 * trước 2.3.0. Phép hợp nhất nằm ở đây để cả hai bên đọc thừa hưởng nó.
 *
 * KHÔNG kiểm "evidence trỏ tới thứ CÓ THẬT" — phép đó cần đọc đĩa, và nó ở lại
 * `check-feature-integrity.mjs`. Hàm này chỉ trả lời vế **cú pháp**, vế duy nhất trả lời được
 * mà không chạm IO, và là vế bắt được ca *"tôi đã kiểm tra rồi"*.
 */
export function selfPraiseClaims(feature) {
  const now = feature && typeof feature === 'object' ? feature : {};
  const criteria = { ...(now.platforms || {}) };
  for (const k of ['a11y', 'perf']) if (now[k] !== undefined) criteria[k] = now[k];
  const out = [];
  for (const [name, v] of Object.entries(criteria)) {
    if (v?.passes !== true) continue;
    if (!String(v.evidence ?? '').trim()) out.push(name);
  }
  return out;
}

/**
 * Ghi một dòng vào log telemetry. `kind` = tên file không đuôi.
 *
 * BẤT BIẾN: việc ghi chép KHÔNG BAO GIỜ được đổi kết quả của hook. Log không ghi
 * được, đĩa đầy, thư mục biến mất — không cái nào được đổi exit code, vì exit code
 * là toàn bộ hợp đồng giữa hook và harness. Đó là lý do có `try {} catch {}` rỗng.
 */
export function telemetry(kind, fields) {
  // Cờ này cho `block()` biết chỗ gọi đã tự ghi sổ rồi — xem `block()` cho lý do đầy đủ.
  // Đặt TRƯỚC `try`: kể cả khi việc ghi thất bại (đĩa đầy), ý ĐỊNH ghi vẫn đã được nêu, và
  // `block()` ghi thêm một dòng nữa cũng sẽ thất bại y hệt. Không có gì cứu được bằng cách
  // ghi hai lần vào một cái đĩa đầy.
  if (kind === 'gate-fails') gateFailLogged = true;
  try {
    const line = [new Date().toISOString(), config().project?.id ?? '-', ...fields.map(f => String(f).replace(/[|\n\r]/g, ' '))].join('|');
    appendFileSync(join(telemetryDir(), `${kind}.log`), line + '\n', 'utf8');
  } catch {}
}

/** Chỗ gọi đã tự ghi `gate-fails` trong tiến trình này chưa. Một tiến trình = một hook = một
 *  lần chặn (hook exit ngay ở `block()`), nên một cờ boolean là đủ và không mất thông tin. */
let gateFailLogged = false;

/**
 * ═══ SỔ GHI ĐƯỢC THÌ PHẢI ĐÓNG ĐƯỢC ═════════════════════════════════════════
 *
 * `rituals.mjs` lái tín hiệu *"tới hạn"* của `/harness-propose` bằng một phép đếm **mọi dòng
 * từng có** trong `gate-fails.log`. Không cửa sổ thời gian, không trạng thái đóng.
 *
 * Đo 2026-08-07 (issue #105): ba lần chặn lúc `12:00:44` · `12:26:00` · `12:26:01` — **cả ba
 * đã xử lý xong** (mở `HARNESS_DRI`, rồi mọi thay đổi vùng cấm đi qua PR #79–#101). Việc đã
 * xong, nghi thức vẫn đỏ, và **không lệnh nào làm nó xanh lại được**.
 *
 * `fixlog` có `--close` từ **v2.11.0**. Bài học đó được giải ở đúng một chỗ và không tổng quát
 * hoá cho cái sổ **cùng file, cách 380 dòng**.
 *
 * VÌ SAO NÓ TỆ HƠN VẺ NGOÀI: một tín hiệu không bao giờ xanh lại được thì **thôi là tín hiệu**.
 * Người đọc học được rằng mục đó không đáng phản ứng, và lần nó đỏ THẬT cũng không ai phản ứng.
 * `rituals.mjs` đã tự viết ra đúng câu đó về một mục khác — rồi không áp cho mục này.
 *
 * ── ĐÂY KHÔNG PHẢI NÚT TẮT, VÀ BA THỨ GIỮ NÓ TRUNG THỰC
 *
 *   1. **Lý do bắt buộc.** Không có lý do thì không đóng được.
 *   2. **Dòng đóng nằm trong CHÍNH cái sổ đang audit** — nó không xoá gì, nó chỉ nói *"mọi
 *      thứ tới đây đã xử lý"*, và người review sau vẫn đọc được cả hai.
 *   3. **Occurrence mới TỰ MỞ LẠI.** Đóng lúc `T` chỉ vô hiệu các dòng TRƯỚC `T`. Một lần
 *      chặn mới ngày mai làm nghi thức đỏ lại mà không ai phải nhớ gì.
 *
 * So sánh ISO string bằng `>` là đúng ở đây: mọi dòng do `telemetry()` ghi đều là
 * `new Date().toISOString()` — cùng định dạng, cùng UTC, nên thứ tự từ vựng = thứ tự thời gian.
 */
export const TELEMETRY_CLOSED = '__CLOSED__';

/**
 * Mọi dòng trong một sổ, đã tách cột. `null` = KHÔNG ĐỌC ĐƯỢC ⇒ `?` ở bên gọi, **không phải
 * 0**: "chưa có log" và "chưa lần nào xảy ra" là hai chuyện khác nhau.
 */
export function telemetryEntries(kind, { dir = null } = {}) {
  const f = join(dir ?? telemetryDir(), `${kind}.log`);
  if (!existsSync(f)) return [];                 // log chưa tồn tại là 0 THẬT
  try {
    return readFileSync(f, 'utf8').split('\n').filter(Boolean).map(line => {
      const p = line.split('|');
      return { at: p[0], project: p[1], selector: p[2], detail: p.slice(3).join('|'), raw: line };
    });
  } catch { return null; }
}

/** Dòng CÒN MỞ: bỏ dòng đóng, và bỏ mọi dòng khớp nằm TRƯỚC lần đóng gần nhất. */
export function openTelemetryEntries(kind, selector = null, opts = {}) {
  const all = telemetryEntries(kind, opts);
  if (all === null) return null;
  let closedAt = '';
  for (const e of all) {
    if (e.selector !== TELEMETRY_CLOSED) continue;
    const sel = e.detail.split('|')[0];
    if (sel === '*' || sel === selector) { if (e.at > closedAt) closedAt = e.at; }
  }
  return all.filter(e => e.selector !== TELEMETRY_CLOSED
    && (selector == null || e.selector === selector)
    && e.at > closedAt);
}

/** Ghi một dòng ĐÓNG. Trả `false` khi thiếu lý do — đóng không lý do là tắt đèn, không phải xử lý. */
export function closeTelemetry(kind, selector, reason, { dir = null } = {}) {
  if (!selector || !String(reason || '').trim()) return false;
  try {
    const line = [new Date().toISOString(), config().project?.id ?? '-', TELEMETRY_CLOSED,
      String(selector).replace(/[|\n\r]/g, ' '), String(reason).replace(/[|\n\r]/g, ' ')].join('|');
    appendFileSync(join(dir ?? telemetryDir(), `${kind}.log`), line + '\n', 'utf8');
    return true;
  } catch { return false; }
}

/**
 * ═══ SỔ TRẠNG THÁI NGHI THỨC — ĐO XEM MỘT TÍN HIỆU CÓ TẮT ĐƯỢC KHÔNG (L0008) ═
 *
 * Khối ngay TRÊN đây (`TELEMETRY_CLOSED`) chữa MỘT cái sổ. Bệnh thì tổng quát hơn thế, và nó
 * tái phát **bốn lần trong hai tuần** sau khi cái sổ kia đã có nút đóng:
 *
 *   W32 §1 · `/harness-propose` đếm mọi dòng từng có        → nút đóng, ĐÃ XÂY
 *   v2.61.0 (#174) · `flat-ok` treo vào `b.measured`         → cờ chỉ có nghĩa với gói metered
 *   #180 (#181) · `flat-limited` khi `rateLimitHits > 0`     → 19 lần chạm / cửa sổ TRƯỢT 30 ngày
 *   #182 (#183) · `fixlogTotal >= 10`                        → số ĐỜI, sổ chỉ biết ghi thêm
 *
 * Hợp đồng W32 đề xuất (*"bộ đếm lái tín hiệu phải khai `window:` hoặc `closable:`"*) bắt được
 * đúng **một** trong ba ca tuần W33: `rateLimitHits` CÓ cửa sổ 30 ngày và vẫn đỏ vĩnh viễn, vì
 * một cửa sổ trượt trên tín hiệu bạn còn tiếp tục sinh ra thì không bao giờ cạn. Nên `window`
 * và `closable` là hai CÁCH ĐẠT TỚI tính chất cần có, không phải tính chất đó:
 *
 *   ► Tồn tại một trạng thái mà check trả `ok`, và trạng thái đó tới được bằng đúng hành động
 *     ghi ở `cmd`.
 *
 * ── VÌ SAO ĐO, KHÔNG BẮT KHAI
 *
 * Bắt mỗi nghi thức khai `clearedBy:` là rule cứng trá hình (dạng 7, đắt nhất và mục nhanh
 * nhất): người viết nghi thức mới sẽ điền một câu nghe hợp lý, và **không gì kiểm được câu đó**.
 * Thứ kiểm được là LỊCH SỬ — và nguyên liệu miễn phí, vì `rituals` đã chạy ở mỗi SessionStart.
 *
 * ── VÌ SAO SNAPSHOT, KHÔNG PHẢI SỔ APPEND
 *
 * Rủi ro lớn nhất của cơ chế này là **chính nó thành bộ đếm không đóng được** — đúng bệnh nó đi
 * chữa. Một snapshot O(1) không thể: nó giữ MỘT dòng cho mỗi nghi thức đang tồn tại, và mọi
 * phán quyết đọc `since` (mốc TỰ ĐẶT LẠI khi trạng thái đổi) chứ không đọc một tổng tích luỹ.
 * Nghi thức bị xoá khỏi `RITUALS` mang theo dòng của nó (`results` là danh sách CÓ THẨM QUYỀN),
 * nên không có đường cho một mục kẹt vĩnh viễn về một nghi thức không còn tồn tại.
 *
 * ── GIỚI HẠN ĐÃ ĐO, KHÔNG PHẢI GIẢ ĐỊNH
 *
 * Sổ này gộp hai MÔI TRƯỜNG vào một dòng lịch sử. Đo 2026-08-12: `claude-code-drift` ra `ok`
 * khi chạy từ terminal (`CLAUDE_CODE_EXECPATH` có mặt) và `?` khi chạy từ `session-start` hook
 * (không có) — nên `since` của nó đảo mỗi lượt và nó KHÔNG BAO GIỜ tích đủ 14 ngày.
 *
 * Chấp nhận, vì nó không chạm lớp bệnh cần bắt: mục *"đỏ mà không tắt được"* ra `due` ở MỌI môi
 * trường (`flat-limited`, `fixlogTotal >= 10` — cả hai đo trên file trong repo). Thứ đảo theo
 * môi trường là các mục `?`, và `?` đã có đường báo riêng ở cả `rituals` lẫn `report()`. Hỏng
 * theo chiều BỎ SÓT một cảnh báo, không theo chiều bịa ra một cảnh báo.
 */
export const RITUAL_STATES_FILE = () => join(stateDir(), 'ritual-states.json');

/**
 * Hợp nhất một lượt đo vào sổ — **THUẦN**, `nowIso` truyền vào để test lái được thời gian.
 *
 * HAI CHIỀU SAI, và chiều thứ hai im lặng (`L0007`):
 *
 *   ① `since` KHÔNG đổi khi trạng thái không đổi. Đặt lại mỗi lượt ⇒ `dueDays` luôn bằng 0 ⇒
 *      cảnh báo KHÔNG BAO GIỜ nổ. Không triệu chứng nào, và nó chính là mutant M1 của lô này.
 *   ② `since` PHẢI đổi khi trạng thái đổi. Giữ nguyên ⇒ một nghi thức xanh rồi đỏ lại được tính
 *      là "đỏ liên tục từ hồi đó" ⇒ cảnh báo nổ nhầm, và `L0002` nói guard bắn nhầm còn tệ hơn
 *      không có guard.
 *
 * `results` rỗng ⇒ **trả nguyên `prev`**, không ghi gì. Một lượt không đo được gì mà vẫn ghi
 * `lastRunAt` là cách sổ tự khai "tôi vẫn đang nhìn" trong khi nó không nhìn thấy gì.
 */
export function mergeRitualStates(prev, results, nowIso) {
  if (!Array.isArray(results) || !results.length) return prev ?? null;
  const now = String(nowIso);
  const before = (prev && typeof prev === 'object' && prev.rituals && typeof prev.rituals === 'object') ? prev.rituals : {};
  const rituals = {};
  for (const r of results) {
    const id = String(r?.id ?? '').trim();
    if (!id) continue;
    const state = String(r?.state ?? '?');
    const p = before[id];
    const unchanged = p && p.state === state && p.since;
    rituals[id] = {
      state,
      since: unchanged ? String(p.since) : now,
      lastOkAt: state === 'ok' ? now : (p?.lastOkAt ?? null),
      okRuns: (Number(p?.okRuns) || 0) + (state === 'ok' ? 1 : 0),
      runs: (Number(p?.runs) || 0) + 1,
    };
  }
  if (!Object.keys(rituals).length) return prev ?? null;
  return {
    firstRunAt: prev?.firstRunAt || now,
    lastRunAt: now,
    runs: (Number(prev?.runs) || 0) + 1,
    rituals,
  };
}

/**
 * Nghi thức nào ĐỎ liên tục ≥`days` ngày mà CHƯA LẦN NÀO xanh — **THUẦN**, trả `{ mode, … }`.
 *
 * Cùng hình dạng với `budgetStatus`: **mode mang phán quyết**, và ba mode "chưa trả lời được"
 * trả `stuck: null` chứ không phải `[]`. `[]` ở đó là câu *"đã nhìn, không có gì"* — với một
 * repo vừa áp harness hôm qua thì đó là lời khai sai, và nó sai theo chiều dễ chịu (`L0005`).
 *
 *   unmeasured  chưa có sổ / sổ hỏng
 *   warming     sổ có rồi nhưng quãng quan sát < `days` — in ĐẾM NGƯỢC, không in kết luận
 *   stale       lượt ghi cuối đã quá `days` ngày ⇒ cửa sổ nằm hoàn toàn trong quá khứ
 *   stuck       ≥1 nghi thức `due` liên tục ≥`days` ngày với **0** lần `ok`
 *   pending     có mục đỏ lâu, nhưng mục nào cũng TỪNG xanh ⇒ việc tồn, không phải tín hiệu hỏng
 *   ok          cửa sổ đã đủ, không mục nào đỏ liên tục ≥`days` ngày
 *
 * ── HAI CHỖ DỄ VIẾT SAI, cả hai đã có ca test
 *
 * **`dueDays` đo từ `lastRunAt`, KHÔNG từ `now`.** Ngừng chạy `rituals` hai tháng thì con số
 * phải ĐỨNG YÊN, không được lớn lên: nó là số ngày ĐÃ QUAN SÁT thấy đỏ, không phải số ngày đã
 * trôi qua. Đây đúng là lý do `tallyLines()` có `sinceMs` — một bằng chứng cũ đọc thành bằng
 * chứng hôm nay là cách bảng điều khiển nói "ổn" trong khi nó chưa nhìn.
 *
 * **`okRuns === 0` là điều kiện, không phải trang trí.** Một nghi thức đỏ 30 ngày mà tháng
 * trước còn xanh là **việc của bạn đang tồn** — nó tắt được, bạn chưa tắt. Một nghi thức chưa
 * xanh lần nào trong cả quãng quan sát là **tín hiệu không có trạng thái tắt**. Gộp hai thứ đó
 * thì dòng cảnh báo nổ với người vừa nghỉ phép hai tuần, và `L0002` nói chính xác chuyện gì xảy
 * ra tiếp theo.
 */
export function stuckRituals(snap, { now = Date.now(), days = 14 } = {}) {
  const D = 86400000;
  const base = { mode: 'unmeasured', days, spanDays: null, staleDays: null, tracked: null, stuck: null, pending: null };
  if (!snap || typeof snap !== 'object' || !snap.rituals || typeof snap.rituals !== 'object') return base;
  const first = Date.parse(snap.firstRunAt ?? ''), last = Date.parse(snap.lastRunAt ?? '');
  if (!Number.isFinite(first) || !Number.isFinite(last)) return base;

  const spanDays = Math.round((last - first) / D);
  const staleDays = Math.round((now - last) / D);
  const tracked = Object.keys(snap.rituals).length;
  // Mốc ghi ở TƯƠNG LAI (đồng hồ máy lùi, hoặc sổ chép từ máy khác) rơi vào `stale` — không
  // phải vì nó cũ, mà vì `staleDays` âm nghĩa là phép so không còn nghĩa gì. Cùng cách
  // `flatCapoReading()` từ chối một mốc tương lai thay vì tính ra một tuổi âm.
  if (staleDays > days || staleDays < 0) return { ...base, mode: 'stale', spanDays, staleDays, tracked };
  if (spanDays < days) return { ...base, mode: 'warming', spanDays, staleDays, tracked };

  const rows = [];
  for (const [id, r] of Object.entries(snap.rituals)) {
    if (r?.state !== 'due') continue;
    const since = Date.parse(r.since ?? '');
    if (!Number.isFinite(since)) continue;
    const dueDays = Math.round((last - since) / D);
    if (dueDays < days) continue;
    rows.push({ id, dueDays, okRuns: Number(r.okRuns) || 0, runs: Number(r.runs) || 0 });
  }
  rows.sort((a, b) => b.dueDays - a.dueDays);
  const stuck = rows.filter(r => r.okRuns === 0);
  const pending = rows.filter(r => r.okRuns > 0);
  return { mode: stuck.length ? 'stuck' : pending.length ? 'pending' : 'ok', days, spanDays, staleDays, tracked, stuck, pending };
}

/** Đọc sổ. `null` = chưa có / không đọc được ⇒ `stuckRituals` trả `unmeasured`, KHÔNG trả `ok`. */
export function readRitualStates() {
  return readJson(RITUAL_STATES_FILE(), null);
}

/**
 * Ghi một lượt đo vào sổ. Trả sổ mới, hoặc `null` nếu không ghi được.
 *
 * BẤT BIẾN như `telemetry()`: việc ghi chép KHÔNG BAO GIỜ được đổi kết quả của bên gọi. Chỗ gọi
 * là `rituals.collect()`, mà `collect()` chạy trong `session-start` hook ở MỌI phiên — một
 * ngoại lệ ở đây là một phiên không mở được.
 *
 * `stateDir()` không có mệnh đề chuyển hướng `fixture-` như `telemetryDir()`, nên một lần probe
 * tay với `HARNESS_CONFIG` trỏ fixture mà quên `HARNESS_STATE_DIR` sẽ ghi vào sổ thật. Hỏng
 * theo chiều AN TOÀN: một lượt lạ chỉ có thể ĐẶT LẠI `since` (mất một cảnh báo), không thể chế
 * ra một quãng đỏ chưa từng có. Chiều ngược lại mới là chiều `L0002` cấm.
 */
export function recordRitualStates(results, nowIso = new Date().toISOString()) {
  try {
    const next = mergeRitualStates(readRitualStates(), results, nowIso);
    if (!next) return null;
    writeJson(RITUAL_STATES_FILE(), next);
    return next;
  } catch { return null; }
}

/**
 * Ghi "hook này ĐÃ CHẠY" — kể cả khi nó cho qua.
 *
 * VÌ SAO CẦN: một hook KHÔNG phải một lần gọi công cụ, nên không có gì trong
 * transcript nhìn thấy nó chạy. Không có bộ đếm này thì ba tình huống sau đọc
 * GIỐNG HỆT NHAU — cả ba đều là "log rỗng":
 *   · hook chạy suốt tuần, không bắt gì   (đang làm việc TỐT)
 *   · hook chưa từng nổ vì không được cắm  (mã chết)
 *   · hook crash im lặng mỗi lần           (hỏng)
 * Và đây đúng là dữ liệu `/harness-retro` bước 4 cần khi nó bắt buộc đề xuất cắt
 * bỏ. Câu trả lời im lặng nghiêng về "cắt đi" — tức là nghiêng về hướng nguy hiểm.
 *
 * `outcome`: 'pass' | 'block' | 'skip'.
 * Khi render, hook KHÔNG có đường exit 2 phải hiện `n/a`, KHÔNG phải `0`.
 */
export function hookRan(name, outcome = 'pass', detail = '') {
  telemetry('hook-runs', [name, outcome, detail]);
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

/** Hậu tố `evalTree()` đóng lên mọi thứ nó gỡ. Một hằng, vì bốn công cụ đọc nó. */
export const BARE_SUFFIX = '.bare-disabled';

/**
 * CÂY NÀY VỪA BỊ GỠ LỚP HARNESS **CÓ CHỦ Ý** — và nó tự khai điều đó.
 *
 * `evals/run.mjs --bare` đổi tên `.claude/settings.json` → `…${BARE_SUFFIX}` để đo
 * `eval − eval --bare`. Trên cây đó, mọi công cụ đọc `settings.json` / `.claude/rules` đều đỏ,
 * và thông điệp của chúng nói *"neo đã trôi"* hoặc *"repo có đường dẫn chết"*. Câu đó ĐÚNG trong
 * repo thật (ai đó vừa đổi tên một thứ) và **SAI** ở đây (không ai đổi tên gì; file bị gỡ theo
 * yêu cầu). Cùng lớp lỗi #155 và v2.54.0 đã dọn ở lớp eval — một thông điệp đúng cho ca này gửi
 * người đọc đi sai hướng ở ca kia.
 *
 * Hậu quả ĐO ĐƯỢC: công cụ đỏ ⇒ assertion gọi nó bị chấm `n/a` ở chiều trần ⇒ task **lệch mẫu
 * số** ⇒ rơi khỏi phép trừ. `node evals/run.mjs --denominators` đếm đúng con số đó.
 *
 * ĐIỀU KIỆN LÀ **BẰNG CHỨNG**, KHÔNG PHẢI SỰ VẮNG MẶT — và đó là toàn bộ giá trị của hàm này.
 * Neo vào cái xác `${BARE_SUFFIX}`, thứ chỉ `evalTree()` tạo ra. Neo vào `!exists(settings.json)`
 * biến nó thành **cửa thoát**: mọi repo áp template mất `settings.json` sẽ được mọi suite chấm
 * XANH, không một triệu chứng nào. Có ca test khoá đúng dòng dưới đây (`tooling/test-hooks.mjs`,
 * ca `harnessStripped`), vì một hằng chuỗi im lặng là chỗ dễ sửa sai nhất trong file này.
 */
export function harnessStripped() {
  return exists(repoPath('.claude', `settings.json${BARE_SUFFIX}`));
}

/**
 * In báo cáo NGẮN, có hành động. Dùng cho mọi script trong tooling/.
 *
 * NĂM RỔ, KHÔNG PHẢI BA. Ba giá trị dưới đây KHÔNG BAO GIỜ được gộp:
 *
 *   ok/warn/fail — ĐÃ ĐO, và đây là kết quả.
 *   na           — KHÔNG ÁP DỤNG, vĩnh viễn: bằng không DO CẤU TRÚC. Một hook không
 *                  có đường exit 2 thì `fired` không thể nhúc nhích — số 0 ở đó không
 *                  phải bằng chứng nó vô dụng.
 *   unknown      — CHƯA ĐO ĐƯỢC: chưa có dữ liệu. Khác `0`, vốn khẳng định phép đo
 *                  ĐÃ chạy và không thấy gì.
 *
 * Gộp bất kỳ hai cái nào là cách một thay đổi schema biến thành một đề xuất XOÁ.
 * Và luật đi kèm: một tổng kết có `unknown` thì KHÔNG được gọi là "xanh" —
 * "harness không chạy" là TRẠNG THÁI THỨ BA, không phải pass, không phải fail.
 */
/**
 * Câu phán CUỐI của một lần kiểm — in ra **stderr**, không stdout.
 *
 * Đo 2026-08-12 trong chính repo này:
 *
 *     node -e '…; process.exit(3)' | tail -1   →   pipeline_exit=0
 *
 * Ống dẫn trả mã của tiến trình **CUỐI**, nên nó nuốt exit code; và nó nuốt luôn mọi
 * dòng stdout không lọt bộ lọc. Một suite ĐỎ đọc qua `| tail` / `| grep` đọc ra XANH.
 * Đã xảy ra thật 2026-08-11 (sổ `fixlog`): hai check ĐỎ của `harness-doctor`
 * (`entropy-scan`, `apply-to --audit`) đi qua một `| grep` và được viết "xanh" vào PR.
 *
 * stderr KHÔNG đi qua ống dẫn đó — nó ra thẳng terminal, sống sót qua `| tail`,
 * `| head`, `| grep`, `> file`. Đó là toàn bộ lý do chọn stderr; đây không phải
 * chuyện thẩm mỹ về "lỗi thì in ở đâu".
 *
 * CHỈ in khi hỏng. Một dòng "xanh" mỗi lần chạy sẽ được học cách bỏ qua trong một
 * tuần, và lúc đó dòng ĐỎ chìm theo — đúng lớp lỗi của mọi cảnh báo thường trực.
 *
 * `unknown` nêu RIÊNG, KHÔNG cộng vào `fail`: "chưa đo được" không phải "hỏng", và
 * cũng không phải "đạt" — AGENTS.md cấm gộp hai cái đó.
 *
 * ĐIỀU KIỆN THOÁT: khi công cụ chạy lệnh báo được exit code của TỪNG chặng trong ống
 * dẫn (hoặc bật sẵn `pipefail`), dòng này thành thừa.
 */
export function verdictLine(title, { fail = 0, unknown = 0, code = null } = {}) {
  const f = Math.max(0, Number(fail) || 0);
  const u = Math.max(0, Number(unknown) || 0);
  const hasCode = code !== null && code !== undefined;
  const c = hasCode ? (Number(code) || 0) : 0;
  // Có `code` thì `code` là sự thật, KHÔNG phải `fail`: `harness-doctor` cố ý exit 0
  // khi chỉ có mục không-chí-tử, và một dòng ✗ ở đó là guard bắn nhầm (`L0002`).
  if (hasCode ? c === 0 : f === 0) return null;
  const parts = [];
  if (f) parts.push(`${f} FAIL`);
  if (u) parts.push(`${u} CHƯA ĐO ĐƯỢC`);
  if (hasCode) parts.push(`exit=${c}`);
  return `✗ ${String(title ?? '').trim() || 'kiểm tra'} — ${parts.join(' · ') || 'hỏng'}`;
}

/** Viết `verdictLine` ra stderr. Trả dòng đã viết, hoặc `null` khi không có gì để nói. */
export function emitVerdict(title, opts = {}, write = null) {
  const line = verdictLine(title, opts);
  if (line === null) return null;
  const w = write ?? ((s) => { try { process.stderr.write(s + '\n'); } catch {} });
  w(line);
  return line;
}

/**
 * `verdict: false` cho báo cáo dùng rổ `fail` với nghĩa **"việc đang tới hạn"**, không phải
 * "lần chạy này hỏng" — `rituals.mjs --all` là ca duy nhất, và nó `process.exit(0)` có chủ ý.
 * Không có cửa này thì mọi phiên có nghi thức tới hạn in một dòng ✗ trên một lần chạy ĐẠT, và
 * dấu ✗ bị học cách bỏ qua trong một tuần — hỏng đúng thứ nó sinh ra để làm.
 */
export function report(title, { ok = [], warn = [], fail = [], na = [], unknown = [] }, { verdict = true } = {}) {
  console.log(`\n=== ${title} ===`);
  // Mọi báo cáo nói ra nó đo ở CÂY NÀO — một chỗ, mọi công cụ thừa hưởng.
  const scope = reportScope();
  if (scope) console.log('  ' + scope);
  for (const m of ok) console.log('  OK   ' + m);
  for (const m of warn) console.log('  WARN ' + m);
  for (const m of fail) console.log('  FAIL ' + m);
  for (const m of na) console.log('  n/a  ' + m);
  for (const m of unknown) console.log('  ?    ' + m);
  if (na.length) console.log(`  → ${na.length} mục KHÔNG ÁP DỤNG: bằng không do cấu trúc, không phải phát hiện.`);
  if (unknown.length) console.log(`  → ${unknown.length} mục CHƯA ĐO ĐƯỢC: đây KHÔNG phải 0. Báo cáo này chưa được gọi là xanh.`);
  if (!ok.length && !warn.length && !fail.length && !na.length && !unknown.length) console.log('  (không có gì để báo cáo)');
  console.log('');
  // Mọi dòng ở trên là stdout, nên `| tail` / `| grep` xoá sạch được chúng CÙNG với
  // exit code. Một dòng ra stderr là thứ duy nhất người gọi không lọc mất.
  if (verdict) emitVerdict(title, { fail: fail.length, unknown: unknown.length });
  return fail.length === 0;
}

export { homedir, tmpdir };
