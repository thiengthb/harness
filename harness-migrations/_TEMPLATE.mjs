/**
 * Khuôn migration. Copy thành `<NNN>-<slug>.mjs` và điền.
 * Xem harness-migrations/README.md.
 */

export const version = '0.0.0';                 // version template mà migration này thuộc về
export const description = 'một câu, thể chủ động';

/**
 * @param {object} ctx
 *   repoPath(...parts) · readJson(p, fallback) · writeJson(p, obj)
 *   readFileSync · writeFileSync · existsSync · run(bin, args) · log(msg)
 */
export async function up(ctx) {
  // 1. KIỂM TRẠNG THÁI TRƯỚC — migration phải idempotent.
  //    Project có thể đã ở trạng thái đích (chạy lại, hoặc vừa áp template mới).
  //
  // if (đã ở trạng thái đích) { ctx.log('bỏ qua — đã đúng'); return; }

  // 2. Sửa. KHÔNG xoá dữ liệu của project.

  // 3. Log những gì đã đổi, kèm SỐ LƯỢNG cụ thể.
  //    ctx.log(`đã chuyển ${n} mục`);

  // 4. Không làm được thì throw kèm CÁCH SỬA TAY:
  //    throw new Error('không parse được X — sửa tay: mở <file>, đổi Y thành Z');
}
