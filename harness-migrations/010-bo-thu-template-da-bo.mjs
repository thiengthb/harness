/**
 * Lớp phân phối biết THÊM và biết SỬA, nhưng không biết XOÁ.
 *
 * Đo 2026-08-05: `/whats-new` bị cắt khỏi template ở **v2.4.0** (commit `21834ca`) và vẫn nằm
 * ở **cả ba** repo tiêu thụ — sáu version sau. Nó đẩy cả ba lên 13 skill trên trần 12, nên
 * `entropy-scan` báo đỏ ở mọi phiên về một thứ mà project KHÔNG gây ra, và nâng cấp bao nhiêu
 * lần cũng không hết. Đó là dạng đỏ tệ nhất: đỏ đúng, nhưng không ai sửa được từ phía mình.
 *
 * Đây là chiều ngược của lỗ hổng đã sửa ở 2.8.0 (sự kiện hook mới không tới được repo đã áp).
 * Cùng một nguyên nhân: lớp phân phối chỉ đồng bộ MỘT CHIỀU.
 *
 * ── HAI ĐIỀU KIỆN AN TOÀN, vì đây là migration DUY NHẤT XOÁ FILE
 *
 * 1. Chỉ xoá thứ có tên trong `REMOVED_PATHS` — danh sách TƯỜNG MINH ở `lib/harness.mjs`.
 *    KHÔNG suy luận "có ở đích mà không có ở template": phép đó không phân biệt được
 *    "harness đã bỏ" với "project tự thêm" và "công cụ khác cài vào" (`prisma init` đổ 9 skill
 *    vào `.claude/skills/` — có thật). Suy luận ở đây nghĩa là xoá nhầm file của người dùng.
 *
 * 2. Chỉ xoá khi file CÒN NGUYÊN như harness đã đặt — so `sha` với `.claude/harness-manifest.json`.
 *    Người dùng đã sửa ⇒ GIỮ LẠI và nói ra. Một migration xoá đè lên chỉnh sửa của người dùng
 *    là thứ khiến cả cơ chế nâng cấp mất niềm tin, và mất niềm tin thì lần sau không ai nâng nữa.
 *
 * Không có manifest (repo áp bằng đường khác) ⇒ KHÔNG xoá gì, chỉ nhắc. Thà để lại một skill
 * thừa còn hơn xoá mù.
 */
import { createHash } from 'node:crypto';
import { readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const version = '2.11.0';
export const description = 'Xoá những thứ template đã bỏ (REMOVED_PATHS) — chỉ khi còn nguyên như harness đặt';

/** Liệt kê file dưới một đường dẫn (file hoặc thư mục), trả đường dẫn TƯƠNG ĐỐI kiểu POSIX. */
function filesUnder(root, rel) {
  const abs = join(root, rel);
  let st;
  try { st = statSync(abs); } catch { return []; }
  if (st.isFile()) return [rel];
  const out = [];
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    out.push(...filesUnder(root, `${rel}/${e.name}`));
  }
  return out;
}

export async function up(ctx) {
  const { repoPath, readJson, readFileSync, existsSync, log } = ctx;

  // Danh sách bia mộ đọc từ lib của TEMPLATE khi có thể — nếu migration này chạy dưới một
  // `upgrade.mjs` cũ không có `tplPath`, ta dùng bản nhúng bên dưới. Nhúng là cố ý: một
  // migration KHÔNG được phụ thuộc vào việc lib mới đã sang hay chưa (luật migration số 2).
  let REMOVED = [{ path: '.claude/skills/whats-new', since: '2.4.0' }];
  if (typeof ctx.tplPath === 'function') {
    try {
      const mod = await import(new URL('file://' + ctx.tplPath('tooling', 'lib', 'harness.mjs').split('\\').join('/')).href);
      if (Array.isArray(mod.REMOVED_PATHS) && mod.REMOVED_PATHS.length) REMOVED = mod.REMOVED_PATHS;
    } catch { /* dùng bản nhúng */ }
  }

  const present = REMOVED.filter(r => existsSync(repoPath(...r.path.split('/'))));
  if (!present.length) return;

  const manifest = readJson(repoPath('.claude', 'harness-manifest.json'));
  if (!manifest?.files) {
    log(`⚠ ${present.length} thứ template đã bỏ vẫn còn (${present.map(r => r.path).join(' · ')}) nhưng KHÔNG có `
      + 'manifest để đối chiếu ⇒ không xoá gì. Xoá tay nếu bạn chắc, hoặc chạy `apply-to --apply --update` một lần để tạo manifest.');
    return;
  }

  const removed = [], kept = [];
  for (const r of present) {
    const files = filesUnder(repoPath(''), r.path);
    const modified = files.filter(f => {
      const want = manifest.files[f];
      if (!want) return true;   // manifest không biết file này ⇒ coi như người dùng thêm ⇒ GIỮ
      // Cùng phép băm với `upgrade.mjs` (sha256, 16 ký tự đầu) — đo lại 2026-08-05 trên
      // manifest thật của `warehouse` để chắc hai bên khớp. Lệch phép băm ở đây nghĩa là MỌI
      // file đều "đã sửa" và migration này lặng lẽ không xoá gì bao giờ.
      const got = createHash('sha256').update(readFileSync(repoPath(f))).digest('hex').slice(0, 16);
      return got !== want;
    });
    if (modified.length) { kept.push(`${r.path} (${modified.length} file đã sửa)`); continue; }
    rmSync(repoPath(...r.path.split('/')), { recursive: true, force: true });
    removed.push(`${r.path} (template bỏ ở v${r.since})`);
  }

  for (const r of removed) log(`✓ xoá ${r}`);
  if (kept.length) {
    log(`⚠ GIỮ LẠI ${kept.length} thứ template đã bỏ vì bạn đã sửa chúng: ${kept.join(' · ')}. `
      + 'Migration không ghi đè chỉnh sửa của người dùng — xoá tay nếu bạn không cần nữa.');
  }
}

export const expect = {
  file: '.claude/harness-manifest.json',
  mustContain: ['templateVersion'],
};
