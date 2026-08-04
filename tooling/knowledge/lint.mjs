#!/usr/bin/env node
/**
 * Kiểm sức khoẻ của knowledge/lessons/ và sinh knowledge/index.json.
 *
 * Bắt bốn thứ mà con người luôn bỏ sót:
 *   - frontmatter thiếu/sai (bài học không lint được thì không export được)
 *   - THIẾU exit-condition  → bài học sẽ sống mãi mãi
 *   - quá hạn expires-review → có thể đã thành dead weight
 *   - occurrences < 2        → một lần là ngẫu nhiên, chưa đủ để promote
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from '../lib/frontmatter.mjs';
import { repoPath, writeJson, report, exists } from '../lib/harness.mjs';

const DIR = repoPath('knowledge', 'lessons');
const REQUIRED = ['id', 'title', 'scope', 'class', 'representation', 'status', 'added', 'exit-condition'];
const SCOPES = /^(universal|project|stack:[a-z0-9._-]+)$/;
const CLASSES = ['context', 'tools', 'orchestration', 'state', 'verification', 'recovery', 'economics', 'learning'];
const REPRS = ['test', 'generator', 'computational-control', 'verification-skill', 'gotcha', 'skill', 'rule'];
// `candidate` = nhận từ repo khác, repo NÀY chưa gặp lần nào. Xem tooling/knowledge/accept.mjs.
const STATUSES = ['active', 'candidate', 'superseded', 'retired'];
// Dạng nào cưỡng chế bằng máy thì phải có gate đi kèm, nếu không bên nhận
// không kiểm được nó còn đúng hay không.
const NEEDS_GATE = ['test', 'computational-control', 'generator'];
const CANDIDATE_STALE_DAYS = 90;

const ok = [], warn = [], fail = [];
const index = [];

if (!exists(DIR)) {
  report('KNOWLEDGE LINT', { warn: ['knowledge/lessons/ chưa tồn tại'] });
  process.exit(0);
}

const files = readdirSync(DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'));
const seenIds = new Map();

for (const f of files) {
  const { data, body } = parseFrontmatter(readFileSync(join(DIR, f), 'utf8'));
  const tag = `${f}`;

  const missing = REQUIRED.filter(k => data[k] === undefined || data[k] === '' || data[k] === null);
  if (missing.length) { fail.push(`${tag}: thiếu ${missing.join(', ')}`); continue; }

  if (seenIds.has(data.id)) fail.push(`${tag}: id ${data.id} trùng với ${seenIds.get(data.id)}`);
  seenIds.set(data.id, f);

  if (!SCOPES.test(String(data.scope))) fail.push(`${tag}: scope "${data.scope}" không hợp lệ (universal | project | stack:<tên>)`);
  if (!CLASSES.includes(String(data.class))) fail.push(`${tag}: class "${data.class}" không thuộc bảng chẩn đoán`);
  if (!REPRS.includes(String(data.representation))) fail.push(`${tag}: representation "${data.representation}" không hợp lệ`);
  if (!STATUSES.includes(String(data.status))) fail.push(`${tag}: status "${data.status}" không hợp lệ (${STATUSES.join(' | ')})`);

  const occ = Number(data.occurrences ?? 0);
  if (data.status === 'active' && occ < 2) {
    warn.push(`${tag}: occurrences=${occ} — một lần là ngẫu nhiên, chưa đủ điều kiện promote`);
    if (Array.isArray(data['seen-in']) && data['seen-in'].length >= 2) {
      warn.push(`${tag}:   ↑ nhưng đã thấy ở ${data['seen-in'].length} repo độc lập — gộp bằng chứng: node tooling/knowledge/accept.mjs <ref> --merge ${data.id}`);
    }
  }

  // Một bài học được ghi xuống LẦN THỨ HAI đã tự chứng minh rằng việc ghi xuống
  // KHÔNG CÓ TÁC DỤNG. Lần thứ hai nó phải có một cái gác — hook nếu có chỗ ghi
  // file để bắt, detector nếu bằng chứng chỉ hiện ra khi nhìn cả repo hoặc nhìn
  // qua thời gian — HOẶC thân bài phải nói THÀNH LỜI vì sao không thể có gác.
  // Lựa chọn thứ ba hợp lệ, nhưng không được là mặc định: câu trả lời cho "làm sao
  // đừng lặp lại" mà luôn là "ghi xuống và nhớ kỹ hơn" thì chính những bài học đó
  // là bằng chứng cách ấy không đủ.
  //
  // ĐIỀU KIỆN THOÁT: khi tỉ lệ bài học `active` có `artifacts` vượt 80%, hạ xuống info.
  const noMechanism = !(Array.isArray(data.artifacts) && data.artifacts.length);
  const explains = /không thể có (cơ chế|gác)|vì sao không có (cơ chế|gác)/i.test(body ?? '');
  if (data.status === 'active' && occ >= 2 && noMechanism && !explains) {
    warn.push(`${tag}: occurrences=${occ} nhưng \`artifacts\` RỖNG — ghi xuống lần thứ hai đã tự chứng minh ghi xuống không đủ. `
      + `Phải có cơ chế (hook/detector/test), HOẶC viết vào thân bài vì sao KHÔNG thể có cơ chế nào bắt được.`);
  }

  // Gate phải đi kèm bài học, nếu không "bước 3 không được bỏ" chính là bước
  // không đi được sang repo khác.
  if (data.status === 'active' && NEEDS_GATE.includes(String(data.representation))
      && !(Array.isArray(data.evals) && data.evals.length)) {
    warn.push(`${tag}: dạng "${data.representation}" mà không có \`evals:\` — mang sang repo khác thì bên nhận không kiểm được`);
  }
  for (const e of (Array.isArray(data.evals) ? data.evals : [])) {
    if (!exists(repoPath(String(e).split(' ')[0]))) fail.push(`${tag}: evals "${e}" không tồn tại`);
  }

  // Bài học nhận từ repo khác mà 3 tháng repo NÀY chưa gặp lần nào → nó không đúng
  // ở đây. Giữ lại là nợ context; đây chính là dạng rác mà import không gác thì tích lại.
  if (data.status === 'candidate') {
    const days = (Date.now() - new Date(data.added).getTime()) / 86400000;
    if (Number.isFinite(days) && days > CANDIDATE_STALE_DAYS) {
      warn.push(`${tag}: candidate đã ${Math.round(days)} ngày (>${CANDIDATE_STALE_DAYS}) — repo này chưa gặp lần nào. Gặp rồi → status: active. Chưa → retire.`);
    }
  }

  if (data.status === 'active' && ['rule', 'skill'].includes(String(data.representation))) {
    warn.push(`${tag}: representation="${data.representation}" là dạng đắt nhất. Đã kiểm 1–5 chưa? (xem knowledge/README.md)`);
  }

  const review = data['expires-review'];
  if (review) {
    const due = new Date(review).getTime();
    if (!Number.isNaN(due) && due < Date.now() && data.status === 'active') {
      warn.push(`${tag}: quá hạn review (${review}) — chạy /entropy-sweep, có thể đã là dead weight`);
    }
  } else if (data.status === 'active') {
    warn.push(`${tag}: không có expires-review — bài học này sẽ không bao giờ bị xét lại`);
  }

  if (!Array.isArray(data.evidence) || data.evidence.length === 0) {
    warn.push(`${tag}: không có evidence — đây là ý kiến, chưa phải bằng chứng`);
  }

  index.push({
    id: data.id, file: `knowledge/lessons/${f}`, title: data.title,
    scope: data.scope, class: data.class, representation: data.representation,
    status: data.status, added: data.added, occurrences: occ,
    artifacts: Array.isArray(data.artifacts) ? data.artifacts : [],
  });
}

index.sort((a, b) => String(a.id).localeCompare(String(b.id)));
writeJson(repoPath('knowledge', 'index.json'), {
  generatedBy: 'tooling/knowledge/lint.mjs',
  count: index.length,
  byScope: index.reduce((m, l) => ({ ...m, [l.scope]: (m[l.scope] || 0) + 1 }), {}),
  lessons: index,
});

ok.push(`${index.length} bài học hợp lệ → knowledge/index.json`);
const portable = index.filter(l => l.scope !== 'project' && l.status === 'active').length;
ok.push(`${portable} bài học mang đi được sang project khác`);

process.exit(report('KNOWLEDGE LINT', { ok, warn, fail }) ? 0 : 1);
