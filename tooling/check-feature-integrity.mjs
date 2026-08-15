#!/usr/bin/env node
/**
 * Cưỡng chế luật "chỉ được sửa passes/evidence" của features/*.json.
 *
 *   node tooling/check-feature-integrity.mjs [origin/main]
 *
 * Cùng một luật ("không được xoá/sửa test"):
 *   - biểu diễn dạng CI check   → bền vĩnh viễn
 *   - biểu diễn dạng câu văn trong prompt → mục dần
 * Đây là bản CI check.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { repoPath, git, readJson, report, exists, selfPraiseClaims, guardFlags } from './lib/harness.mjs';

guardFlags(process.argv.slice(2), {}, { name: 'check-feature-integrity.mjs' });

const base = process.argv[2] || 'origin/main';
const dir = repoPath('features');
if (!existsSync(dir)) { console.log('Không có features/ — bỏ qua.'); process.exit(0); }

const MUTABLE = new Set(['passes', 'evidence', 'verifiedAt']);
const ok = [], warn = [], fail = [];

// ── _index.json phải trỏ tới file CÓ THẬT ────────────────────────────────────
//
// NHẬN TỪ `sakubun` (pack upstream @0655730, 2026-08-07) — phép kiểm ra đời ở repo con.
// Nó là ca thứ BẢY của L0005, tìm được ở một repo ĐỘC LẬP: theo knowledge/README.md, bằng
// chứng từ hai repo khác nhau mạnh hơn hai lần trong cùng một repo.
//
// Chạy TRƯỚC phép kiểm git bên dưới, vì nó không cần ref nào: nó chỉ so danh sách với đĩa.
//
// Vì sao thêm (2026-08-07): phần dưới cố ý bỏ qua file `_`-prefix, nên khi `features/` chỉ có
// `_index.json` + `_TEMPLATE.json` thì báo cáo in "(không có gì để báo cáo)" và exit 0 — đọc như một
// cổng đang canh, thực ra là một cổng không canh gì. Trong khi chính `_index.json` đang liệt một entry
// `example-feature` trỏ tới file `example-feature.json` KHÔNG TỒN TẠI. Danh sách feature là thứ
// AGENTS.md §Verification dựa vào; một danh sách nói dối được mà không ai kiểm thì luật "Default-FAIL"
// chỉ còn là câu văn.
//
// Đây là WARN chứ không phải FAIL, cố ý: một entry mẫu trong repo vừa áp harness là trạng thái BÌNH
// THƯỜNG, và một cổng bắt đầu đời mình bằng màu đỏ ở mọi project là cổng dạy người ta bỏ qua nó.
const INDEX = repoPath('features', '_index.json');
if (existsSync(INDEX)) {
  const index = readJson(INDEX);
  if (!index) fail.push('features/_index.json: JSON không parse được');
  else {
    const entries = Array.isArray(index.features) ? index.features : [];
    if (!entries.length) ok.push('features/_index.json: chưa đăng ký feature nào');
    for (const e of entries) {
      const p = String(e?.file ?? '');
      if (!p) fail.push(`features/_index.json: entry "${e?.id ?? '?'}" thiếu \`file\``);
      else if (!exists(repoPath(p)))
        warn.push(`features/_index.json: "${e?.id ?? '?'}" trỏ tới ${p} — KHÔNG TỒN TẠI. `
          + 'Viết file đó, hoặc bỏ entry khỏi index (DRI sửa — hook chặn agent).');
      else ok.push(`features/_index.json: ${e.id} → ${p}`);
    }
  }
}


if (git(['rev-parse', '--verify', base]).status !== 0) {
  // Không có ref để so diff → bỏ phần so-với-base, NHƯNG vẫn in phần đã kiểm được ở trên.
  // Trước đây dòng này `process.exit(0)` thẳng, nên trên một cây không có `origin/main`
  // (clone nông, worktree mới, CI không fetch đủ sâu) mọi phát hiện về `_index.json` biến
  // mất KHÔNG DẤU VẾT — gate exit 0 và người đọc thấy một dòng "bỏ qua" vô hại.
  //
  // Phần thứ BA của đóng góp từ `sakubun`, và là phần tôi suýt bỏ sót: lần merge đầu chỉ lấy
  // khối `_index.json` nên `exit(0)` cũ ở lại, và CI ba OS đỏ ngay — đúng chỗ nó phải đỏ.
  ok.push(`không tìm thấy ref ${base} — bỏ phần so diff (CI cần fetch-depth: 0)`);
  process.exit(report('FEATURE INTEGRITY', { ok, warn, fail }) ? 0 : 1);
}

function baseVersion(relPath) {
  const r = git(['show', `${base}:${relPath}`]);
  if (r.status !== 0) return null; // file mới
  try { return JSON.parse(r.stdout); } catch { return null; }
}

function diffKeys(a, b, prefix = '') {
  const out = [];
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    const path = prefix ? `${prefix}.${k}` : k;
    const av = a?.[k], bv = b?.[k];
    if (JSON.stringify(av) === JSON.stringify(bv)) continue;
    const leaf = path.split('.').pop();
    if (MUTABLE.has(leaf)) continue;
    if (av && bv && typeof av === 'object' && typeof bv === 'object' && !Array.isArray(av)) {
      out.push(...diffKeys(av, bv, path));
    } else {
      out.push(path);
    }
  }
  return out;
}

for (const f of readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
  const rel = `features/${f}`;
  const now = readJson(repoPath(rel));
  if (!now) { fail.push(`${rel}: JSON không parse được`); continue; }

  const before = baseVersion(rel);
  if (!before) { ok.push(`${rel}: file mới`); continue; }

  const changed = diffKeys(before, now);
  if (changed.length) {
    fail.push(`${rel}: sửa field không được phép → ${changed.join(', ')}\n         Chỉ được đổi: ${[...MUTABLE].join(', ')}. Xoá/sửa step là KHÔNG CHẤP NHẬN ĐƯỢC.`);
  }

  // ── evidence bắt buộc khi passes=true, VÀ nó phải TRỎ TỚI THỨ CÓ THẬT ──────
  //
  // Hai lỗ trước 2.3.0:
  //
  //  1. Chỉ kiểm `evidence` KHÁC RỖNG. Nên `"evidence": "đã chụp rồi"` đi qua sạch —
  //     luật "Tôi đã kiểm tra KHÔNG phải bằng chứng" bị cưỡng chế ở tầng CÚ PHÁP mà
  //     không ở tầng THAM CHIẾU. Một chuỗi không trỏ đi đâu là một câu khẳng định.
  //  2. Vòng lặp chỉ đi qua `platforms.*`. Nhưng `a11y` và `perf` là ANH EM của
  //     `platforms`, không nằm trong nó — nên `a11y.passes = true` với evidence rỗng
  //     đi qua im lặng. Đúng hai field mà `commands.a11y`/`commands.perf` vừa được
  //     thêm để sinh bằng chứng cho.
  //
  // URL (`https://` — CI job, dashboard) KHÔNG kiểm tồn tại: repo không được phép gọi
  // mạng để chấm một PR. Còn lại coi là đường dẫn trong repo và PHẢI tồn tại.
  const criteria = { ...(now.platforms || {}) };
  for (const k of ['a11y', 'perf']) if (now[k] !== undefined) criteria[k] = now[k];
  const beforeCrit = { ...(before?.platforms || {}) };
  for (const k of ['a11y', 'perf']) if (before?.[k] !== undefined) beforeCrit[k] = before[k];

  // Vế "evidence RỖNG" đi qua `selfPraiseClaims()` ở lib — CÙNG hàm mà hook `TaskCompleted`
  // gọi (#131). Hai bản chép của luật này sẽ bất đồng về câu *"đã xong chưa"*, câu đắt nhất
  // trong repo. Vế "trỏ tới thứ CÓ THẬT" ở lại đây, vì nó cần đọc đĩa.
  const praised = new Set(selfPraiseClaims(now));
  for (const name of praised) {
    fail.push(`${rel}: ${name}.passes=true nhưng evidence rỗng. "Tôi đã kiểm tra" không phải bằng chứng.`);
  }
  for (const [name, v] of Object.entries(criteria)) {
    if (v?.passes !== true || praised.has(name)) continue;
    const ev = String(v.evidence ?? '').trim();
    if (!/^https?:\/\//.test(ev) && !exists(repoPath(ev))) {
      fail.push(`${rel}: ${name}.evidence trỏ tới "${ev}" — KHÔNG tồn tại trong repo.\n`
        + `         Bằng chứng phải là đường dẫn có thật (docs/evidence/<issue>/... — xem skill \`verify-ui\`) hoặc URL http(s).`);
      continue;
    }
    if (beforeCrit?.[name]?.passes === false) ok.push(`${rel}: ${name} false → true (evidence: ${ev})`);
  }
}

process.exit(report('FEATURE INTEGRITY', { ok, warn, fail }) ? 0 : 1);
