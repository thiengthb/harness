/**
 * Sổ quyết định của vòng học nằm trong thư mục BỊ IGNORE, nên nó chưa từng được commit.
 *
 * `knowledge/incoming/` nằm trong `REQUIRED_IGNORE` — và đó là quyết định ĐÚNG: pack là
 * snapshot, `upstream --apply` sinh lại nó mỗi lần chạy. Nhưng `accept.mjs` ghi
 * `DECISIONS.log` VÀO chính thư mục đó, nên sổ thừa hưởng luôn cái ignore.
 *
 * Đo 2026-08-05 ở template: `git ls-files knowledge/incoming/DECISIONS.log` → **0**. Toàn bộ
 * lịch sử MERGE / ACCEPT / RETURN / REJECT của vòng học chỉ tồn tại trên MỘT máy, không đi qua
 * review, và mất khi đổi máy. Sổ đó là thứ trả lời *"pack này đã bị từ chối chưa, vì sao?"* —
 * không trả lời được thì cùng một pack được duyệt lại mãi, tức bước quyết định của vòng học
 * không có bộ nhớ.
 *
 * VÌ SAO KHÔNG THÊM `!knowledge/incoming/DECISIONS.log`. Git **không** re-include được một file
 * mà THƯ MỤC CHA đã bị loại — đo bằng `git check-ignore` ngày 2026-08-05, cùng phép đo sinh ra
 * `REQUIRED_UNIGNORE = ['!.claude/']` ở 2.5.0. Một dòng `!` như vậy trông như đã sửa và không
 * sửa gì cả; đó là dạng lỗi tệ nhất trong `.gitignore` vì nó im lặng.
 *
 * Nên cách duy nhất đúng là ĐỔI CHỖ: sổ ra ngoài thư mục bị ignore.
 */
export const version = '2.10.0';
export const description = 'Chuyển knowledge/incoming/DECISIONS.log → knowledge/DECISIONS.log (ra khỏi vùng ignore)';

export async function up(ctx) {
  const { repoPath, existsSync, readFileSync, writeFileSync, log } = ctx;

  const from = repoPath('knowledge', 'incoming', 'DECISIONS.log');
  const to = repoPath('knowledge', 'DECISIONS.log');

  if (!existsSync(from)) return;   // chưa có sổ ⇒ accept.mjs bản mới sẽ ghi vào chỗ đúng.

  // GỘP, không ghi đè: sổ ở chỗ mới có thể đã có dòng (project đã nâng một phần, hoặc đã tự
  // chuyển tay). Ghi đè ở đây làm mất đúng thứ migration này ra đời để cứu.
  const oldText = readFileSync(from, 'utf8');
  const newText = existsSync(to) ? readFileSync(to, 'utf8') : '';
  const seen = new Set(newText.split('\n').filter(Boolean));
  const added = oldText.split('\n').filter(Boolean).filter(l => !seen.has(l));

  if (added.length) {
    writeFileSync(to, (newText ? newText.replace(/\n*$/, '\n') : '') + added.join('\n') + '\n', 'utf8');
  }

  // XOÁ bản cũ, không để lại. Hai sổ song song là hai nguồn sự thật, và bản ở vùng ignore là
  // bản không ai thấy — nên nó sẽ là bản lệch. `git rm` không dùng được: file đang bị ignore
  // nên nó chưa từng được track.
  ctx.run('node', ['-e', `require('fs').unlinkSync(${JSON.stringify(from)})`]);

  log(`✓ chuyển sổ quyết định ra khỏi vùng ignore: knowledge/DECISIONS.log (+${added.length} dòng)`
    + ' — từ giờ nó được COMMIT, tức đi qua review và sang được máy khác');
}

export const expect = {
  file: 'knowledge/DECISIONS.log',
  mustContain: ['MERGE', 'DÒNG-CŨ-PHẢI-SỐNG-SÓT'],
};
