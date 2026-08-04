/**
 * v1.2.0 → v1.3.0
 *
 * Bản trước coi mọi file trong `migrations/` là file GENERATED và chặn sửa.
 * Sai: hầu hết stack sinh KHUNG rồi bạn viết THÂN (Rails, Alembic, Django data
 * migration, Prisma, Flyway/Liquibase/golang-migrate viết tay 100%). Guard bắn
 * nhầm hằng ngày, và còn khuyên sai — "sửa nguồn rồi chạy gen" trong khi không
 * có nguồn nào cả.
 *
 * Cái nguy hiểm thật là sửa migration ĐÃ MERGE. Đó là việc của
 * `.claude/hooks/protect-migrations.mjs`, hook mới ở v1.3.0.
 *
 * Migration này vá `harness.config.json` của project để khớp.
 * Không xoá gì của project: nếu bạn đã tự sửa `paths.generated`, phần còn lại giữ nguyên.
 */

export const version = '1.3.0';
export const description = 'Bỏ migrations khỏi paths.generated, thêm paths.migrations và project.integrationBranch';

// Điều kiện ⑤ của `tooling/test-migrations.mjs`. Migration này vá TEXT bằng regex, và chế độ
// hỏng của vá-text là **ăn quá nhiều** — nên `mustContain` neo vào hai thứ nằm NGAY CẠNH vùng
// bị sửa (`__generated__` ở cuối mảng `generated`, `"id"` ở trên `dri`) chứ không neo vào thứ
// nó thêm. Một mục `expect` chỉ khẳng định "cái mới có mặt" thì im lặng đúng lúc regex đã ăn
// mất phần khác của file.
export const expect = {
  file: 'harness.config.json',
  mustContain: [
    '"migrations"', '"integrationBranch"',                 // đã thêm
    '"**/__generated__/**"', '"**/*.gen.*"',               // mảng generated không bị ăn
    '"id"', '"platforms"',                                 // khối project còn nguyên
    '$comment_paths', '$comment_commands',                 // comment không bị ăn
  ],
};

export async function up(ctx) {
  const p = ctx.repoPath('harness.config.json');
  if (!ctx.existsSync(p)) { ctx.log('không có harness.config.json — bỏ qua'); return; }

  // Sửa TEXT chứ không parse-rồi-stringify: file này có $comment_* và định dạng
  // thủ công mà project có thể đã sửa. Ghi đè bằng JSON.stringify sẽ xoá hết.
  let s = ctx.readFileSync(p, 'utf8');
  const before = s;
  const done = [];

  const MIG_IN_GENERATED = /^[ \t]*"\*\*\/migrations\/\*\*",?[ \t]*\r?\n/m;
  const genBlock = s.match(/"generated"\s*:\s*\[[\s\S]*?\]/);
  if (genBlock && MIG_IN_GENERATED.test(genBlock[0])) {
    s = s.replace(genBlock[0], genBlock[0].replace(MIG_IN_GENERATED, ''));
    done.push('bỏ "**/migrations/**" khỏi paths.generated');
  }

  if (!/"migrations"\s*:/.test(s)) {
    const m = s.match(/([ \t]*)"generated"\s*:\s*\[[\s\S]*?\],\r?\n/);
    if (m) {
      const ind = m[1];
      s = s.replace(m[0], m[0] +
        `${ind}"$comment_migrations": "Migration KHÔNG phải file generated — hầu hết stack sinh KHUNG rồi bạn viết THÂN. Cái nguy hiểm là sửa migration ĐÃ MERGE: DB lệch im lặng, hỏng checksum của migration runner. protect-migrations.mjs chỉ chặn đúng ca đó. Để [] nếu project không có migration.",\n` +
        `${ind}"migrations": [\n` +
        `${ind}  "**/migrations/**",\n` +
        `${ind}  "**/migrate/**",\n` +
        `${ind}  "**/db/migrate/**",\n` +
        `${ind}  "**/alembic/versions/**"\n` +
        `${ind}],\n`);
      done.push('thêm paths.migrations');
    } else {
      throw new Error(
        'không tìm thấy paths.generated trong harness.config.json — sửa tay: thêm khoá "migrations" ' +
        'vào "paths" với giá trị ["**/migrations/**","**/migrate/**","**/db/migrate/**","**/alembic/versions/**"], ' +
        'và bỏ "**/migrations/**" khỏi "generated".',
      );
    }
  }

  if (!/"integrationBranch"\s*:/.test(s)) {
    const m = s.match(/([ \t]*)"dri"\s*:\s*"[^"]*",\r?\n/);
    if (m) {
      s = s.replace(m[0], m[0] + `${m[1]}"integrationBranch": "origin/main",\n`);
      done.push('thêm project.integrationBranch = origin/main');
    } else {
      ctx.log('⚠ không thêm được project.integrationBranch — hook sẽ tự dò origin/main. Thêm tay nếu nhánh tích hợp của bạn khác.');
    }
  }

  if (s === before) { ctx.log('bỏ qua — config đã đúng'); return; }

  try { JSON.parse(s); } catch (e) {
    throw new Error(
      `vá xong nhưng harness.config.json không còn là JSON hợp lệ (${e.message}) — KHÔNG ghi. ` +
      'Sửa tay theo harness-migrations/001-migration-khong-phai-generated.mjs.',
    );
  }

  ctx.writeFileSync(p, s, 'utf8');
  for (const d of done) ctx.log(d);
  ctx.log('nếu project bạn thật sự SINH migration và không muốn sửa tay: chuyển glob đó ngược lại vào paths.generated');

  registerHook(ctx);
}

/**
 * Đăng ký hook mới vào .claude/settings.json.
 *
 * BẮT BUỘC phải làm ở đây: `settings.json` thuộc lớp NỘI DUNG (project sửa được),
 * nên `upgrade.mjs` không bao giờ ghi đè nó. Copy file hook sang mà không đăng ký
 * = hook nằm đó chết, và không ai biết. Mọi migration thêm hook đều phải có bước này.
 */
function registerHook(ctx) {
  const p = ctx.repoPath('.claude', 'settings.json');
  if (!ctx.existsSync(p)) { ctx.log('⚠ không có .claude/settings.json — đăng ký protect-migrations.mjs bằng tay'); return; }

  const CMD = 'node .claude/hooks/protect-migrations.mjs';
  const raw = ctx.readFileSync(p, 'utf8');
  if (raw.includes('protect-migrations')) { ctx.log('hook đã được đăng ký sẵn'); return; }

  let s;
  try { s = JSON.parse(raw); } catch (e) {
    throw new Error(`.claude/settings.json không parse được (${e.message}) — thêm tay: {"type":"command","command":"${CMD}"} vào PreToolUse matcher Write|Edit`);
  }

  const groups = s.hooks?.PreToolUse;
  const target = Array.isArray(groups) && groups.find(g => /Write/.test(g.matcher || ''));
  if (!target || !Array.isArray(target.hooks)) {
    ctx.log(`⚠ không tìm thấy nhóm PreToolUse matcher Write|Edit — thêm tay: {"type":"command","command":"${CMD}"}`);
    return;
  }

  target.hooks.push({ type: 'command', command: CMD });
  ctx.writeFileSync(p, JSON.stringify(s, null, 2) + '\n', 'utf8');
  ctx.log(`đăng ký protect-migrations.mjs vào PreToolUse (matcher "${target.matcher}")`);
}
