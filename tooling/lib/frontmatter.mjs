/**
 * Parser frontmatter tối giản, không dependency.
 * Hỗ trợ đúng những gì harness dùng: scalar, list dạng `- item`, list inline [a, b],
 * và block scalar `>` / `|`. Không phải YAML đầy đủ — cố ý.
 */

function parseScalar(raw) {
  let v = raw.trim();
  if (v === '') return '';
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map(s => parseScalar(s)).filter(s => s !== '');
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  // bỏ comment cuối dòng (chỉ khi có khoảng trắng trước #)
  const hash = v.search(/\s#/);
  if (hash > -1) v = v.slice(0, hash).trim();
  return v;
}

/** Trả về { data, body }. Không có frontmatter → data = {}. */
export function parseFrontmatter(text) {
  const src = String(text).replace(/^﻿/, '');
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: src };

  const data = {};
  const lines = m[1].split(/\r?\n/);
  let key = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const listItem = line.match(/^\s+-\s+(.*)$/);
    if (listItem && key) {
      if (!Array.isArray(data[key])) data[key] = [];
      data[key].push(parseScalar(listItem[1]));
      continue;
    }

    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    key = kv[1];
    const rest = kv[2];

    if (rest === '>' || rest === '|' || rest === '>-' || rest === '|-') {
      const buf = [];
      while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1])) {
        buf.push(lines[++i].trim());
      }
      data[key] = buf.join(rest.startsWith('>') ? ' ' : '\n');
    } else if (rest === '') {
      data[key] = [];   // chờ list item ở dòng sau
    } else {
      data[key] = parseScalar(rest);
    }
  }

  return { data, body: m[2] };
}

/** Serialize ngược lại — dùng khi script cần ghi lesson mới. */
export function stringifyFrontmatter(data, body) {
  const out = ['---'];
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) {
      out.push(`${k}:`);
      for (const item of v) out.push(`  - ${JSON.stringify(String(item))}`);
    } else if (typeof v === 'string' && (v.includes('\n') || v.includes(': '))) {
      out.push(`${k}: ${JSON.stringify(v)}`);
    } else {
      out.push(`${k}: ${v}`);
    }
  }
  out.push('---', '');
  return out.join('\n') + String(body || '').replace(/^\n+/, '');
}
