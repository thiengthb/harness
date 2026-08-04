/**
 * v2.4.1 → v2.5.0
 *
 * HAI thứ mà copy file không làm được, và cả hai đều là "đã áp rồi thì im lặng sai".
 *
 * ① `.gitignore` / `.gitattributes` trước 2.5.0 nằm trong `SEED` của `apply-to.mjs`, và
 *    SEED **không bao giờ ghi đè file đã tồn tại**. Mọi project THẬT đều đã có
 *    `.gitignore` ⇒ các dòng của harness chưa từng tới đúng nhóm project mà harness
 *    nhắm tới. Copy file ở bước trước của `upgrade.mjs` cũng không sửa được: hai file
 *    này thuộc project, ghi đè chúng là phá dữ liệu. Phép đúng là THÊM DÒNG THIẾU.
 *
 * ② ADR của lớp harness hạ cánh thành `docs/adr/0001-*` và `0002-*`, tức là chiếm số
 *    0001/0002 của SẢN PHẨM. Sau migration này chúng ở `docs/adr/harness/`, và số
 *    0001 trả về cho quyết định đầu tiên của đội.
 *
 * CHỈ di chuyển file có ĐÚNG tên mà template đã ship. Một file `docs/adr/0001-*.md` do
 * đội tự viết thì không được đụng tới — đó là dữ liệu của project.
 */
import { REQUIRED_IGNORE, REQUIRED_ATTRIBUTES, REQUIRED_UNIGNORE, missingLines } from '../tooling/lib/harness.mjs';

export const version = '2.5.0';
export const description = 'thêm dòng bắt buộc vào .gitignore/.gitattributes; dời ADR của harness sang docs/adr/harness/';

/** Bốn điều kiện tổng quát chỉ nhìn JSON — không cái nào biết hai file này phải chứa gì. */
export const expect = {
  file: '.gitignore',
  mustContain: ['.claude/settings.local.json', '.claude/telemetry/', '.harness-pack/'],
};

const HARNESS_ADRS = ['0001-harness-baseline.md', '0002-tai-phan-vai-native.md'];

export async function up(ctx) {
  const todo = [];
  // ── ① đường biên commit / không-commit ────────────────────────────────────
  // `!.claude/` chỉ thêm khi ĐO THẤY git đang chôn một file harness — nó đảo một quyết
  // định tường minh của project nên nó phải có bằng chứng. Và nó phải là `!.claude/`:
  // sau khi cả thư mục bị loại, phủ định cho từng FILE bên trong không có tác dụng.
  const isGit = ctx.run('git', ['rev-parse', '--git-dir'])?.status === 0;
  const buried = isGit
    ? ['.claude/settings.json', '.claude/hooks/observe.mjs']
        .filter(p => ctx.run('git', ['check-ignore', '-q', p])?.status === 0)
    : [];

  for (const [rel, required] of [
    ['.gitignore', buried.length ? [...REQUIRED_UNIGNORE, ...REQUIRED_IGNORE] : REQUIRED_IGNORE],
    ['.gitattributes', REQUIRED_ATTRIBUTES],
  ]) {
    const p = ctx.repoPath(rel);
    if (!ctx.existsSync(p)) {
      if (ctx.copyFromTemplate(rel)) ctx.log(`${rel}: chưa có → lấy bản template`);
      continue;
    }
    const cur = ctx.readFileSync(p, 'utf8');
    const miss = missingLines(cur, required);
    if (!miss.length) { ctx.log(`${rel}: đã đủ ${required.length} dòng bắt buộc`); continue; }
    const block = `\n# ── harness (migration ${version}) — xem REQUIRED_IGNORE trong tooling/lib/harness.mjs ──\n`
      + miss.join('\n') + '\n';
    ctx.writeFileSync(p, cur.endsWith('\n') ? cur + block : cur + '\n' + block, 'utf8');
    ctx.log(`${rel}: thêm ${miss.length} dòng — ${miss.join(' · ')}`);
  }

  if (buried.length) {
    ctx.log(`⚠ .gitignore của project đang ignore ${buried.join(' · ')} → đã thêm \`!.claude/\`. `
      + `Trước migration này, harness của đội chỉ tồn tại trên máy người đã chạy apply-to. `
      + `Commit .claude/ trong PR tiếp theo và kiểm bằng: git status --porcelain .claude`);
  }

  // ── ② số ADR ──────────────────────────────────────────────────────────────
  //
  // KHÔNG gọi thẳng `ctx.moveFile`. Migration chạy với `ctx` do **`upgrade.mjs` của
  // PROJECT** dựng — bản CŨ, bản đang nằm trong repo đó — chứ không phải bản của template.
  // `moveFile` ra đời ở 2.5.0, nên ở một project đang ở v1.4.0 nó là `undefined`, và
  // migration này ném `ctx.moveFile is not a function`. Đo thật trên `warehouse` khi nâng
  // v1.4.0 → v2.7.1.
  //
  // LUẬT: **migration chỉ được dùng năng lực `ctx` đã tồn tại ở version CŨ NHẤT còn hỗ
  // trợ, hoặc phải tự dò.** Đây là mặt đối xứng của luật ở migration 003: ở đó là "đừng
  // giả định FILE đã có", ở đây là "đừng giả định API đã có".
  const move = (from, to) => {
    if (typeof ctx.moveFile === 'function') return ctx.moveFile(from, to);
    if (!ctx.existsSync(ctx.repoPath(from)) || ctx.existsSync(ctx.repoPath(to))) return false;
    // Đường lùi chỉ dùng năng lực có từ v1.4.0. `git mv` một mình KHÔNG đủ: nó fail khi
    // thư mục đích chưa tồn tại, và `ctx` cũ không có mkdir. `copyFromTemplate` thì CÓ tạo
    // thư mục — và đích ở đây đúng là một file template ship sẵn, nên lấy bản template là
    // đúng chứ không phải giải pháp tình thế.
    if (!ctx.copyFromTemplate(to)) {
      todo.push(`không lấy được \`${to}\` từ template — dời \`${from}\` sang đó bằng tay.`);
      return false;
    }
    const r = ctx.run('git', ['rm', '-q', '-f', from]);
    if (r?.status === 0) return true;
    todo.push(`đã tạo \`${to}\` nhưng KHÔNG xoá được \`${from}\` (git rm fail). Xoá tay — `
      + `để cả hai thì ADR của lớp harness vẫn chiếm số 0001/0002 của SẢN PHẨM.`);
    return false;
  };
  let moved = 0;
  for (const name of HARNESS_ADRS) {
    if (move(`docs/adr/${name}`, `docs/adr/harness/${name}`)) moved++;
  }
  if (moved) ctx.log(`dời ${moved} ADR của lớp harness sang docs/adr/harness/ — số 0001 giờ thuộc về SẢN PHẨM`);
  else ctx.log('docs/adr/: không có ADR nào của harness cần dời');
  for (const t of todo) ctx.log(`⚠ CẦN NGƯỜI: ${t}`);
}
