/**
 * v1.3.0 → v1.4.0
 *
 * v1.4.0 thêm trường `evals:` vào bài học — GATE đi theo bài học khi nó sang repo
 * khác. Không có nó, repo nhận có cơ chế mà không có cách biết cơ chế đó còn đúng
 * ở chỗ họ hay không, và bước 3 của vòng học ("gate là bước không được bỏ") chính
 * là bước không đi được.
 *
 * Migration này SEED eval task mới của template vào project. Cần vì `upgrade.mjs`
 * chỉ cập nhật lớp CƠ CHẾ — `evals/tasks/` là lớp NỘI DUNG, không bao giờ bị ghi đè,
 * nên một task seed MỚI của template sẽ không tự tới được project đã áp.
 *
 * Không đụng vào bài học của project: thêm `evals:` là quyết định của người viết
 * bài học đó, không phải của script. `lint.mjs` sẽ nhắc.
 */

export const version = '1.4.0';
export const description = 'Seed eval task 0004 và nhắc khai evals: cho bài học đã có';

export async function up(ctx) {
  const SEED_EVALS = ['evals/tasks/0004-khong-merge-tay-lockfile.md'];

  // RÀNG BUỘC CẤU TRÚC — đọc harness-migrations/README.md §"Migration chạy dưới
  // upgrade.mjs của version TRƯỚC". `ctx.copyFromTemplate` được thêm Ở v1.4.0, mà
  // migration v1.4.0 lại chạy dưới `upgrade.mjs` v1.3.0 → nó KHÔNG tồn tại ở đây.
  // Đường lùi: `manifest.source` ghi đường dẫn template lúc áp gần nhất.
  const { mkdirSync, cpSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');

  // Đường lùi tin cậy nhất: đường dẫn template nằm ngay trong argv của lệnh đang
  // chạy (`node tooling/upgrade.mjs <template> --apply`). `manifest.source` thì
  // KHÔNG dùng được — nó ghi template lúc ÁP, tức bản cũ, có thể không có file mới.
  const argvTpl = process.argv.slice(2).find(a => !a.startsWith('--'));

  const copy = (rel) => {
    if (typeof ctx.copyFromTemplate === 'function') return ctx.copyFromTemplate(rel);
    const src = ctx.tplPath ? ctx.tplPath(rel) : (argvTpl ? join(argvTpl, rel) : '');
    if (!src || !ctx.existsSync(src)) throw new Error(`không xác định được đường dẫn template (thử: ${src || 'không có'})`);
    const dst = ctx.repoPath(rel);
    if (ctx.existsSync(dst)) return false;
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst);
    return true;
  };

  let added = 0, failed = 0;
  for (const rel of SEED_EVALS) {
    try {
      if (copy(rel)) { added++; ctx.log(`seed ${rel}`); }
    } catch (e) {
      failed++;
      ctx.log(`⚠ không seed được ${rel}: ${e.message}`);
      ctx.log(`   copy tay: cp <template>/${rel} ${rel}`);
    }
  }
  if (!added && !failed) ctx.log('eval task seed đã có sẵn — bỏ qua');

  // Đếm bài học chưa có gate, để người biết còn việc gì. KHÔNG tự sửa.
  const dir = ctx.repoPath('knowledge', 'lessons');
  if (!ctx.existsSync(dir)) return;

  const { readdirSync } = await import('node:fs');
  const NEEDS_GATE = ['test', 'computational-control', 'generator'];
  let ungated = 0;
  for (const f of readdirSync(dir).filter(f => f.endsWith('.md') && !f.startsWith('_'))) {
    const raw = ctx.readFileSync(ctx.repoPath('knowledge', 'lessons', f), 'utf8');
    const fm = raw.split('---')[1] || '';
    const repr = (fm.match(/^representation:\s*(\S+)/m) || [])[1];
    const status = (fm.match(/^status:\s*(\S+)/m) || [])[1];
    if (status === 'active' && NEEDS_GATE.includes(repr) && !/^evals:/m.test(fm)) ungated++;
  }
  if (ungated) {
    ctx.log(`${ungated} bài học cưỡng chế bằng máy mà chưa khai \`evals:\` — mang sang repo khác thì bên nhận không kiểm được. node tooling/knowledge/lint.mjs để xem danh sách.`);
  }
}
