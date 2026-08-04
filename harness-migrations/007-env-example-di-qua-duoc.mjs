/**
 * v2.7.3 → v2.7.4
 *
 * BẢN SỬA CỦA 1.5.0 CHƯA BAO GIỜ TỚI ĐÍCH.
 *
 * 1.5.0 dạy `matchAny` hiểu phủ định và thêm một dòng phủ định cho `.env.example` vào
 * `paths.secrets` của template. Nhưng `harness.config.json` là NỘI DUNG của project —
 * `upgrade.mjs` không bao giờ đụng vào, và **không ai viết migration**. Nên bản sửa chỉ
 * tới project áp SAU 1.5.0; project áp trước đó vẫn dính nguyên bug mà changelog
 * tuyên bố đã sửa.
 *
 * Đo 2026-08-05 trên ba repo tiêu thụ thật: 2/3 vẫn thiếu phủ định. Triệu chứng đúng như
 * 1.5.0 mô tả — `pre-commit` chặn `.env.example`, tức là chặn **commit đầu tiên** của mọi
 * project mới, vì `tooling/init.mjs` copy chính file đó thành `.env`.
 *
 * LUẬT (README của thư mục này đã ghi, ca này là bằng chứng): đổi ngữ nghĩa một field trong
 * `harness.config.json` thì PHẢI có migration. Sửa ở template mà không có migration là sửa
 * cho project TƯƠNG LAI và bỏ rơi project đang chạy — đúng nhóm người cần bản sửa nhất.
 *
 * Sửa TEXT chứ không parse-rồi-stringify: `harness.config.json` đầy `$comment_*` và thứ tự
 * khoá có nghĩa với người đọc. `JSON.parse` + `stringify` giữ được cả hai, nhưng làm mất
 * định dạng (xuống dòng, thụt lề trong mảng) và biến diff thành cả file.
 */
import { matchAny } from '../tooling/lib/harness.mjs';

export const version = '2.7.4';
export const description = 'thêm "!**/.env.example" vào paths.secrets — bản sửa 1.5.0 chưa từng tới project đã áp';

export const expect = {
  file: 'harness.config.json',
  mustContain: ['"secrets"', '!**/.env.example'],
};

const NEGATION = '"!**/.env.example"';

export async function up(ctx) {
  const p = ctx.repoPath('harness.config.json');
  if (!ctx.existsSync(p)) { ctx.log('không có harness.config.json — bỏ qua'); return; }

  const before = ctx.readFileSync(p, 'utf8');
  if (before.includes('!**/.env.example')) { ctx.log('paths.secrets: đã có phủ định cho .env.example'); return; }

  // HỎI BỘ SO KHỚP THẬT, đừng suy từ hình dạng chuỗi. Một project có thể đã tự sửa bằng
  // cách THU HẸP pattern (`.env.local`, `.env.production`… thay cho một catch-all) — khi đó
  // `.env.example` vốn đã đi qua và không có gì để phủ định. Gặp thật ở `warehouse`.
  // Bản đầu của migration này báo `CẦN NGƯỜI` cho đúng những repo ĐÃ SỬA ĐÚNG — một cảnh
  // báo sai gửi tới người làm đúng, và đó là cách nhanh nhất dạy người ta bỏ qua cảnh báo.
  const secrets = ctx.readJson(p)?.paths?.secrets ?? [];
  if (!matchAny('.env.example', secrets)) {
    ctx.log('paths.secrets: `.env.example` vốn đã đi qua (project đã thu hẹp pattern) — không cần phủ định');
    return;
  }

  // Neo vào DÒNG khai `.env.*`, không neo vào mảng `secrets` nói chung: phủ định phải nằm
  // SAU pattern nó phủ định (luật .gitignore — pattern sau ghi đè pattern trước, xem
  // `matchAny` trong tooling/lib/harness.mjs). Đặt nhầm thứ tự thì dòng có mặt mà vô tác dụng.
  const line = /^([ \t]*)"\*\*\/\.env\.\*",?[ \t]*$/m;
  const m = before.match(line);
  if (!m) {
    ctx.log('⚠ CẦN NGƯỜI: không thấy dòng `"**/.env.*"` trong paths.secrets — thêm tay '
      + '`"!**/.env.example"` NGAY SAU pattern chặn .env, nếu không `tooling/init.mjs` sẽ '
      + 'không commit được .env.example và commit ĐẦU TIÊN của project mới sẽ bị chặn.');
    return;
  }
  const after = before.replace(line, `${m[0].replace(/,?[ \t]*$/, ',')}\n${m[1]}${NEGATION},`);
  ctx.writeFileSync(p, after, 'utf8');
  ctx.log(`paths.secrets: thêm ${NEGATION} — .env.example đi qua được (init.mjs cần nó)`);
}
