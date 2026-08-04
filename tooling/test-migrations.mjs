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
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { repoPath, report, exists } from './lib/harness.mjs';

const MIG_DIR = repoPath('harness-migrations');
const JSON_FILES = ['harness.config.json', join('.claude', 'settings.json')];
const ok = [], fail = [], warn = [], na = [];

const countComments = (dir) => JSON_FILES
  .map(f => (existsSync(join(dir, f)) ? (readFileSync(join(dir, f), 'utf8').match(/\$comment/g) || []).length : 0))
  .reduce((a, b) => a + b, 0);

/** Ảnh chụp nội dung — để so idempotent mà không cần git. */
function snapshot(dir) {
  const out = {};
  const walk = (rel) => {
    const abs = join(dir, rel);
    if (!existsSync(abs)) return;
    if (statSync(abs).isDirectory()) { for (const e of readdirSync(abs)) walk(join(rel, e)); return; }
    out[rel] = readFileSync(abs, 'utf8');
  };
  for (const f of [...JSON_FILES, join('.claude', 'hooks')]) walk(f);
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
  const mod = await import(join(MIG_DIR, f));
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
    if (!bad.length) ok.push(`${label}: fixture CŨ→MỚI · ①②③④ đạt · $comment ${before}→${after}`);

    // ── MUTANT: lazy → greedy. Đây là chế độ hỏng THẬT của cách vá-TEXT, và nó chứng
    // minh hợp đồng ②④ không phải trang trí. Mutation KHÔNG đổi gì ⇒ migration này
    // không dùng regex lazy ⇒ `n/a`, KHÔNG phải pass (đừng gộp hai giá trị đó).
    const src = readFileSync(join(MIG_DIR, f), 'utf8');
    const mutated = src.replaceAll('[\\s\\S]*?', '[\\s\\S]*');
    if (mutated === src) {
      na.push(`${label}: không có regex lazy để đột biến — mutant KHÔNG áp dụng được (khác với "đã bị giết")`);
    } else {
      const mFile = join(MIG_DIR, `.mutant.tmp.${mod.version}.mjs`);
      try {
        writeFileSync(mFile, mutated, 'utf8');
        const mMod = await import(`${mFile}?t=${mod.version}`);
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
