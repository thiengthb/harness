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

  // evidence bắt buộc khi passes=true
  for (const [plat, v] of Object.entries(now.platforms || {})) {
    if (v?.passes === true && !v.evidence) {
      fail.push(`${rel}: platforms.${plat}.passes=true nhưng evidence rỗng. "Tôi đã kiểm tra" không phải bằng chứng.`);
    }
    if (v?.passes === true && before?.platforms?.[plat]?.passes === false) {
      ok.push(`${rel}: ${plat} false → true (evidence: ${v.evidence})`);
    }
  }
}

process.exit(report('FEATURE INTEGRITY', { ok, warn, fail }) ? 0 : 1);
