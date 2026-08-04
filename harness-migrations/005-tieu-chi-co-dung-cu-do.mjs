/**
 * v2.2.0 → v2.3.0
 *
 * `features/_TEMPLATE.json` đòi `a11y.evidence` và `perf.evidence` từ đầu, nhưng
 * `commands` KHÔNG có field nào sinh ra chúng. Hai tiêu chí default-FAIL không có đường
 * hợp pháp nào thành `true` ⇒ người đang gấp điền `"n/a"` cho xong, đúng thói quen mà
 * default-FAIL sinh ra để diệt. **Một tiêu chí không có dụng cụ đo thì không phải tiêu
 * chí, nó là một lời nhắc — và lời nhắc bị bỏ qua bởi người đang gấp.**
 *
 * Thêm `commands.a11y`, `commands.perf` (rỗng) và hai tên gate vào `gates.preMerge`.
 *
 * ĐÚNG HAI field, không thêm `visual`/`coverage`/`seo`: không hợp đồng nào đòi chúng, và
 * một field không script nào đọc là một niềm tin được đóng gói thành cấu hình — lý do
 * `budget.modelTiering` bị cắt ở 2.0.0.
 *
 * Ở `preMerge`, KHÔNG ở `stop`: a11y/perf chạy bằng phút, ngân sách Stop là 30 GIÂY.
 *
 * MUỐN TẮT thì xoá tên gate khỏi mảng, ĐỪNG để lệnh rỗng — "đội tôi không làm a11y" phải
 * là một dòng diff có người duyệt. Gate rỗng đã có `gates.mjs` nói ra (`n/a`) và fail-đóng
 * ở phiên không người, nên để rỗng là chọn cách ồn nhất mà không quyết định gì.
 *
 * Vá TEXT, không parse-rồi-stringify: `harness.config.json` có `$comment_*` và định dạng
 * thủ công mà project có thể đã sửa.
 */

export const version = '2.3.0';
export const description = 'Thêm commands.a11y/perf + hai gate vào preMerge — hai tiêu chí feature file đã đòi từ đầu';

export const expect = {
  file: 'harness.config.json',
  mustContain: ['"a11y"', '"perf"', '"depcruise"', '"typecheck"'],
};

export async function up(ctx) {
  const todo = [];
  const p = ctx.repoPath('harness.config.json');
  if (!ctx.existsSync(p)) {
    todo.push('không thấy harness.config.json — thêm tay `commands.a11y`, `commands.perf` và hai tên đó vào `gates.preMerge`');
    for (const t of todo) ctx.log(`→ CẦN NGƯỜI: ${t}`);
    return;
  }

  let txt = ctx.readFileSync(p, 'utf8');
  const before = txt;

  // 1. commands: chèn sau `"depcruise": "..."`. Neo vào ĐÚNG dòng đó, không dùng
  //    `[\s\S]*?` — một lazy match ở đây ăn sang khối `paths` nếu ai đó đổi thứ tự field.
  if (!/"commands"[\s\S]{0,800}?"a11y"/.test(txt)) {
    const anchor = /( *)"depcruise": "([^"]*)"(,?)\n/;
    if (anchor.test(txt)) {
      // Dấu phẩy cuối được GIỮ LẠI, không hardcode. Nếu `depcruise` là field cuối thì
      // group 3 rỗng ⇒ `perf` cũng không có phẩy; nếu còn field sau nó thì group 3 là
      // `,` ⇒ `perf` phải có phẩy. Bản đầu luôn bỏ phẩy sau `perf` và làm vỡ JSON ở
      // đúng ca thứ hai — fixture KHÔNG bắt được vì trong fixture `depcruise` là cuối.
      // Một fixture chỉ chứng minh được đường đi mà nó đi qua.
      txt = txt.replace(anchor, (_m, sp, val, tail) =>
        `${sp}"depcruise": "${val}",\n`
        + `${sp}"$comment_a11y_perf": "features/_TEMPLATE.json đòi a11y.evidence và perf.evidence; trước 2.3.0 KHÔNG có chỗ nào sinh ra chúng. Muốn TẮT: xoá tên gate khỏi gates.preMerge, ĐỪNG để lệnh rỗng.",\n`
        + `${sp}"a11y": "",\n${sp}"perf": ""${tail}\n`);
    } else {
      todo.push('không tìm được `"depcruise"` trong `commands` — thêm tay `"a11y": ""` và `"perf": ""`');
    }
  } else {
    ctx.log('commands.a11y/perf: đã có');
  }

  // 2. gates.preMerge: chèn vào cuối mảng. Neo vào `"preMerge": [ ... ]` một dòng.
  const pm = /"preMerge":\s*\[([^\]]*)\]/;
  const m = txt.match(pm);
  if (m) {
    if (!/"a11y"/.test(m[1]) || !/"perf"/.test(m[1])) {
      const items = m[1].split(',').map(s => s.trim()).filter(Boolean);
      for (const g of ['"a11y"', '"perf"']) if (!items.includes(g)) items.push(g);
      txt = txt.replace(pm, `"preMerge": [${items.join(', ')}]`);
    } else {
      ctx.log('gates.preMerge: đã có a11y và perf');
    }
  } else {
    todo.push('không tìm được `gates.preMerge` — thêm tay hai tên gate `a11y`, `perf`');
  }

  if (txt !== before) {
    // Validate TRƯỚC khi ghi: một config không parse được làm config() fail-open trả
    // default rỗng ⇒ mọi hook mất `paths`, mọi gate mất danh sách, KHÔNG gì báo đỏ.
    try { JSON.parse(txt); }
    catch (e) { throw new Error(`vá xong nhưng harness.config.json không hợp lệ: ${e.message}`); }
    ctx.writeFileSync(p, txt);
    ctx.log('đã thêm commands.a11y/perf và hai gate vào gates.preMerge');
  }

  todo.push('điền `commands.a11y` và `commands.perf` (ví dụ: axe-core qua browser runner ở 2 viewport · lighthouse budget theo route). '
    + 'Để rỗng thì gate báo `n/a` và fail-ĐÓNG ở phiên không người — ồn nhất mà không quyết định gì');
  todo.push('KHÔNG làm a11y/perf? Xoá tên đó khỏi `gates.preMerge`. Đó là một quyết định có người duyệt, không phải một field rỗng');
  todo.push('Bằng chứng cho hai tiêu chí đó: xem skill `verify-ui` (ảnh 2 viewport vào docs/evidence/<issue>/). '
    + 'Từ 2.3.0 `check-feature-integrity` đòi `evidence` TRỎ TỚI FILE CÓ THẬT, không chỉ khác rỗng');

  for (const t of todo) ctx.log(`→ CẦN NGƯỜI: ${t}`);
}
