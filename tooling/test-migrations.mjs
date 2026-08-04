#!/usr/bin/env node
/**
 * Test MIGRATION như test unit.  ĐÂY LÀ CODE DUY NHẤT GHI VÀO REPO NGƯỜI KHÁC.
 *
 *   node tooling/test-migrations.mjs
 *
 * VÌ SAO FILE NÀY TỒN TẠI
 * `tooling/test-hooks.mjs` mở đầu bằng *"hook là code có quyền chặn công việc của cả
 * team — nhưng hầu như không ai test nó"*. Migration đi xa hơn một bậc: nó **viết lại
 * `harness.config.json` và `.claude/settings.json` của một repo KHÁC**, trên máy người
 * khác, thường lúc họ đang gấp muốn nâng cấp cho xong. Trước 2.0.0 nó không có một dòng
 * test nào — ba migration đã ship theo kiểu đó.
 *
 * Chế độ hỏng đáng sợ nhất KHÔNG phải crash: crash thì `upgrade.mjs` bắt và báo FAIL.
 * Đáng sợ là **chạy thành công và làm sai** — và người ta chỉ phát hiện ở phiên sau, khi
 * mọi hook im lặng vì `config()` fail-open trả default rỗng.
 *
 * ── HỢP ĐỒNG: bốn điều kiện áp cho MỌI migration, không cần viết assert riêng
 *
 *   ① KHÔNG THROW          throw = người phải sửa tay giữa lúc nâng cấp.
 *   ② JSON CÒN HỢP LỆ      file config không parse được là hỏng IM LẶNG: `config()`
 *                          fail-open trả default rỗng ⇒ mọi hook mất `paths`, mọi gate
 *                          mất danh sách, và KHÔNG có gì báo đỏ.
 *   ③ IDEMPOTENT           lần hai phải KHÔNG đổi gì. `upgrade.mjs` chạy lại được (nâng
 *                          cấp hai bước, retry sau lỗi mạng), và một migration không
 *                          idempotent sẽ nhân đôi field ở lần thứ hai.
 *   ④ KHÔNG MẤT `$comment_*`  `harness.config.json` giữ LÝ DO của từng ngưỡng ở đây, và
 *                          project đã sửa chúng.
 *
 *   ④ GÁC CÁI GÌ, CHÍNH XÁC: **regex ăn quá nhiều.** Migration buộc phải vá TEXT chứ
 *   không `JSON.parse`-rồi-`stringify` (vì stringify phá format thủ công mà project đã
 *   sửa), nên nó dùng regex trên file config — và một regex lệch neo hoặc greedy sẽ
 *   ngoạm cả những dòng bên cạnh. `$comment_*` là dòng đứng cạnh nhiều nhất, nên đếm
 *   chúng là cách RẺ NHẤT phát hiện. Mutant có sẵn dưới đây tiêu đúng vào ca đó.
 *
 *   (Ghi rõ vì bản đầu của file này nói sai: `$comment_*` là **key JSON thật**, nên
 *   `JSON.parse` → `JSON.stringify` GIỮ NGUYÊN chúng. Một mutant dựng theo giả thuyết
 *   sai đó sống sót — và một mutant sống sót vì test neo sai là **lỗi của TEST**.)
 *
 * Migration có fixture ở `tooling/fixtures/migration-<version>/` thì chạy trên đường đi
 * THẬT (trạng thái CŨ → mới). Migration không có fixture vẫn chịu hợp đồng, chạy trên
 * bản sao cây HIỆN TẠI — ở đó nó phải là **no-op**, vì repo đã ở trạng thái đích. Nhánh
 * đó rẻ nhưng không vô dụng: nó bắt migration sửa một repo vốn đã đúng.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync, readdirSync, statSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { repoPath, report, exists } from './lib/harness.mjs';

const MIG_DIR = repoPath('harness-migrations');
const JSON_FILES = ['harness.config.json', join('.claude', 'settings.json')];
const ok = [], fail = [], warn = [], na = [];

const countComments = (dir) => JSON_FILES
  .map(f => (existsSync(join(dir, f)) ? (readFileSync(join(dir, f), 'utf8').match(/\$comment/g) || []).length : 0))
  .reduce((a, b) => a + b, 0);

/**
 * Ảnh chụp nội dung — để so idempotent mà không cần git.
 *
 * ĐI TOÀN BỘ CÂY, không đi theo danh sách path cứng. Bản đầu chỉ đi
 * `[...JSON_FILES, '.claude/hooks']`, và migration 004 — cái ĐẦU TIÊN chạm một file
 * không phải JSON (`.github/workflows/ci.yml`) — nhận `③ idempotent đạt` mà điều kiện
 * ③ chưa từng nhìn vào file nó sửa. Một hợp đồng có PHẠM VI khai một lần rồi không ai
 * khẳng định lại sẽ cho ra màu xanh RỖNG đúng lúc nó được cần nhất.
 *
 * Lần thứ ba lớp lỗi này nổ trong repo (xem knowledge/lessons/0003): khi một mutant
 * sống sót hoặc một check xanh đáng ngờ, **nhìn PHẠM VI trước khi nhìn logic.**
 */
function snapshot(dir) {
  const out = {};
  const walk = (rel) => {
    const abs = join(dir, rel);
    if (!existsSync(abs)) return;
    if (statSync(abs).isDirectory()) {
      for (const e of readdirSync(abs)) {
        if (rel === '.' && e === '.git') continue;   // `git init` của prepare(), không phải của migration
        walk(rel === '.' ? e : join(rel, e));
      }
      return;
    }
    out[rel] = readFileSync(abs, 'utf8');
  };
  walk('.');
  return out;
}

const diffKeys = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => a[k] !== b[k]);

/** ctx PHẢI giống cái `upgrade.mjs` dựng — hai cái lệch thì test này đo sai thứ. */
function makeCtx(root, logs) {
  return {
    repoPath: (...p) => join(root, ...p),
    readFileSync, writeFileSync, existsSync,
    readJson: (p, fb = null) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fb; } },
    writeJson: (p, o) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(o, null, 2) + '\n'); },
    run: (bin, args) => spawnSync(bin, args, { cwd: root, encoding: 'utf8' }),
    tplPath: (...p) => repoPath(...p),
    copyFromTemplate: (rel, { overwrite = false } = {}) => {
      const src = repoPath(rel), dst = join(root, rel);
      if (!existsSync(src)) throw new Error(`template không có ${rel}`);
      if (existsSync(dst) && !overwrite) return false;
      mkdirSync(dirname(dst), { recursive: true });
      cpSync(src, dst);
      return true;
    },
    moveFile: (relFrom, relTo) => {
      const from = join(root, relFrom), to = join(root, relTo);
      if (!existsSync(from) || existsSync(to)) return false;
      mkdirSync(dirname(to), { recursive: true });
      renameSync(from, to);
      return true;
    },
    log: m => logs.push(String(m)),
  };
}

function prepare(work, fixture) {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  if (fixture) cpSync(fixture, work, { recursive: true });
  else for (const rel of JSON_FILES) {
    if (!exists(repoPath(rel))) continue;
    mkdirSync(dirname(join(work, rel)), { recursive: true });
    cpSync(repoPath(rel), join(work, rel));
  }
  // git init: migration được phép gọi `git rm`. Không có repo thì nó đi nhánh LỖI thay
  // vì nhánh thật, và test sẽ đo một đường đi mà người dùng không bao giờ gặp.
  spawnSync('git', ['init', '-q', '.'], { cwd: work });
}

/** Chạy hợp đồng, trả về mảng vi phạm (rỗng = đạt). */
async function contract(mod, work, fixture) {
  const bad = [];
  prepare(work, fixture);
  const before = countComments(work);
  const logs1 = [];
  try { await mod.up(makeCtx(work, logs1)); }
  catch (e) { bad.push(`① THROW — ${String(e.message || e).slice(0, 120)}`); return { bad, logs1 }; }

  for (const rel of JSON_FILES) {
    const p = join(work, rel);
    if (!existsSync(p)) continue;
    try { JSON.parse(readFileSync(p, 'utf8')); }
    catch (e) { bad.push(`② ${rel} KHÔNG parse được (${e.message.slice(0, 50)}) — hỏng IM LẶNG, config() fail-open`); }
  }

  const after = countComments(work);
  if (after < before) bad.push(`④ mất ${before - after} \`$comment\` (${before}→${after}) — regex ăn quá nhiều`);

  // ⑤ KẾT QUẢ MONG ĐỢI do chính migration khai — chỉ kiểm khi nó khai.
  //
  // VÌ SAO KHÔNG PHẢI MỘT HEURISTIC. Bản đầu của điều kiện này đo BYTE: "không file nào
  // teo hơn một nửa". Tôi thử nó bằng cách cho regex của 004 ăn tới cuối file — chế độ
  // hỏng THẬT của vá-TEXT — và nó **không bắt được**: đoạn bị ăn chỉ ~40% file nên
  // ngưỡng 50% lọt. Điều kiện ③ cũng không bắt, vì sau khi ăn xong lần hai không còn gì
  // để ăn ⇒ idempotent. Giữ một check vừa THẤT BẠI phép thử của chính nó là giữ đồ trang
  // trí, nên nó bị bỏ chứ không được nới ngưỡng.
  //
  // Bài học rút ra và đáng ghi: **một hợp đồng tổng quát có SÀN.** Bốn điều kiện kia áp
  // cho mọi migration vì chúng nói về thứ mọi migration chia sẻ (không throw, JSON còn
  // đọc được, chạy lại được, không mất `$comment`). "Regex có ăn quá nhiều không" thì
  // phụ thuộc file nào và định dạng gì — không có parser cho mọi định dạng, và thêm
  // dependency chỉ để test là cái giá sai. Chỗ duy nhất biết câu trả lời là MIGRATION.
  //
  //   export const expect = { file: '...', mustContain: [...], mustNotContain: [...] };
  //
  // Khai là TỰ NGUYỆN, và khi không khai thì suite NÓI RA (`n/a`) chứ không tính là đạt.
  if (mod.expect) {
    const e = mod.expect;
    const p = join(work, e.file);
    if (!existsSync(p)) bad.push(`⑤ ${e.file} không còn tồn tại sau up()`);
    else {
      const txt = readFileSync(p, 'utf8');
      for (const s of e.mustContain ?? []) {
        if (!txt.includes(s)) bad.push(`⑤ ${e.file} MẤT đoạn phải giữ: "${s}" — regex ăn quá nhiều`);
      }
      for (const s of e.mustNotContain ?? []) {
        if (txt.includes(s)) bad.push(`⑤ ${e.file} CÒN đoạn phải xoá: "${s}" — regex không khớp`);
      }
    }
  }

  const snap1 = snapshot(work);
  try { await mod.up(makeCtx(work, [])); }
  catch (e) { bad.push(`③ lần chạy thứ hai THROW — ${String(e.message || e).slice(0, 80)}`); return { bad, logs1, before, after }; }
  const changed = diffKeys(snap1, snapshot(work));
  if (changed.length) bad.push(`③ KHÔNG idempotent — lần hai đổi ${changed.join(', ')}`);

  return { bad, logs1, before, after };
}

const files = existsSync(MIG_DIR)
  ? readdirSync(MIG_DIR).filter(f => f.endsWith('.mjs') && !f.startsWith('_') && !f.startsWith('.')).sort()
  : [];
if (!files.length) na.push('không có migration nào để test');

for (const f of files) {
  // pathToFileURL: BẮT BUỘC, không phải trang trí. Trên Windows `join()` cho
  // `D:\\a\\repo\\harness-migrations\\003.mjs`, và `import()` đọc `D:` là PROTOCOL
  // ⇒ ERR_UNSUPPORTED_ESM_URL_SCHEME. Lớp lỗi XANH trên Linux/macOS, ĐỎ trên Windows —
  // `upgrade.mjs` đã làm đúng từ đầu, file này thì không, và job `parity (windows-latest)`
  // bắt được ngay ở PR đầu tiên. Đó chính là lý do suite này phải chạy trên cả 3 OS.
  const mod = await import(pathToFileURL(join(MIG_DIR, f)).href);
  const label = `${f} (v${mod.version ?? '?'})`;
  if (typeof mod.up !== 'function') { fail.push(`${label}: không export \`up()\``); continue; }
  if (!mod.version || !mod.description) { fail.push(`${label}: thiếu \`version\`/\`description\` — upgrade.mjs đọc hai field này`); continue; }

  const fixtureDir = repoPath('tooling', 'fixtures', `migration-${mod.version}`);
  const fixture = exists(fixtureDir) ? fixtureDir : null;
  const work = join(tmpdir(), `harness-mig-${mod.version}-${process.pid}`);

  try {
    const { bad, logs1, before, after } = await contract(mod, work, fixture);
    for (const b of bad) fail.push(`${label}: ${b}`);

    if (!fixture) {
      if (logs1?.some(l => l.startsWith('✓'))) {
        fail.push(`${label}: báo "✓ đã đổi" trên cây ĐANG Ở TRẠNG THÁI ĐÍCH — nó đang sửa thứ vốn đã đúng`);
      }
      warn.push(`${label}: chưa có fixture \`tooling/fixtures/migration-${mod.version}/\` — chỉ kiểm được nhánh "đã ở trạng thái đích", KHÔNG kiểm được đường đi CŨ→MỚI`);
      continue;
    }
    // Nhãn phải nói ĐÚNG đã kiểm mấy điều kiện: ⑤ chỉ chạy khi migration khai `expect`.
    // Viết "①②③④⑤ đạt" cho một migration không khai là cách một suite tuyên bố đã kiểm
    // thứ nó chưa kiểm — cùng lỗi với việc gộp `n/a` vào `pass`.
    if (!bad.length) {
      ok.push(`${label}: fixture ${fixture ? 'CŨ→MỚI' : 'no-op'} · ${mod.expect ? '①②③④⑤' : '①②③④ (⑤ n/a: không khai `expect`)'} đạt · $comment ${before}→${after}`);
    }

    // ── MUTANT: lazy → greedy. Đây là chế độ hỏng THẬT của cách vá-TEXT, và nó chứng
    // minh hợp đồng ②④ không phải trang trí. Mutation KHÔNG đổi gì ⇒ migration này
    // không dùng regex lazy ⇒ `n/a`, KHÔNG phải pass (đừng gộp hai giá trị đó).
    // QUYẾT ĐỊNH "có gì để đột biến không" trên bản ĐÃ BỎ COMMENT.
    //
    // Bản đầu quyết định trên source đầy đủ, và migration 004 — file có comment GIẢI
    // THÍCH rằng nó cố ý KHÔNG dùng `[\s\S]` lazy — bị đọc thành "có regex lazy". Đột
    // biến áp vào văn xuôi, hành vi không đổi, contract xanh, và suite báo
    // `MUTANT SỐNG SÓT`. Một dương tính giả tự tin, và hướng nó nói dối là hướng tệ
    // hơn: nó tố giác một migration đúng.
    //
    // Cùng bẫy với `@vi` tag của tool-catalog: **neo vào CODE, đừng neo vào comment
    // giải thích code.** Bản bỏ comment chỉ dùng để QUYẾT ĐỊNH — đột biến vẫn áp lên
    // source đầy đủ, nên một lần strip sai không làm sai kết quả chạy.
    const src = readFileSync(join(MIG_DIR, f), 'utf8');
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    const mutated = codeOnly.includes('[\\s\\S]*?') ? src.replaceAll('[\\s\\S]*?', '[\\s\\S]*') : src;
    if (mutated === src) {
      na.push(`${label}: không có regex lazy để đột biến — mutant KHÔNG áp dụng được (khác với "đã bị giết")`);
    } else {
      const mFile = join(MIG_DIR, `.mutant.tmp.${mod.version}.mjs`);
      try {
        writeFileSync(mFile, mutated, 'utf8');
        const mMod = await import(`${pathToFileURL(mFile).href}?t=${mod.version}`);
        const { bad: mBad } = await contract(mMod, `${work}-mutant`, fixture);
        if (mBad.length) ok.push(`MUTANT ${label}: regex greedy ⇒ ${mBad[0].slice(0, 62)}… — hợp đồng ĐỎ ĐƯỢC`);
        else fail.push(`MUTANT ${label}: SỐNG SÓT — regex ăn cả file mà hợp đồng vẫn xanh. Nhìn PHẠM VI của check trước khi nhìn logic`);
      } finally {
        try { rmSync(mFile, { force: true }); } catch {}
        try { rmSync(`${work}-mutant`, { recursive: true, force: true }); } catch {}
      }
    }
  } catch (e) {
    fail.push(`${label}: suite lỗi — ${String(e.message || e).slice(0, 140)}`);
  } finally {
    try { rmSync(work, { recursive: true, force: true }); } catch {}
  }
}

process.exit(report(`MIGRATION TESTS (${files.length} migration)`, { ok, warn, fail, na }) ? 0 : 1);
