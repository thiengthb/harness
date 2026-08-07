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
import { repoPath, git, readJson, report, exists } from './lib/harness.mjs';

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
// `example-feature` trỏ tới `features/example-feature.json` KHÔNG TỒN TẠI. Danh sách feature là thứ
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
  console.log(`Không tìm thấy ref ${base} — bỏ qua (chạy trong CI với fetch-depth: 0).`);
  process.exit(0);
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

  for (const [name, v] of Object.entries(criteria)) {
    if (v?.passes !== true) continue;
    const ev = String(v.evidence ?? '').trim();
    if (!ev) {
      fail.push(`${rel}: ${name}.passes=true nhưng evidence rỗng. "Tôi đã kiểm tra" không phải bằng chứng.`);
      continue;
    }
    if (!/^https?:\/\//.test(ev) && !exists(repoPath(ev))) {
      fail.push(`${rel}: ${name}.evidence trỏ tới "${ev}" — KHÔNG tồn tại trong repo.\n`
        + `         Bằng chứng phải là đường dẫn có thật (docs/evidence/<issue>/... — xem skill \`verify-ui\`) hoặc URL http(s).`);
      continue;
    }
    if (beforeCrit?.[name]?.passes === false) ok.push(`${rel}: ${name} false → true (evidence: ${ev})`);
  }
}

process.exit(report('FEATURE INTEGRITY', { ok, warn, fail }) ? 0 : 1);
