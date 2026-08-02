## Mục đích

<!-- Một câu. Nếu cần hai câu, có thể PR này nên chẻ. -->

Refs:

## Ai làm

- [ ] Người viết phần lớn
- [ ] Agent viết phần lớn, người review từng file
- [ ] **Agent tự trị, người chỉ đọc bằng chứng** ← tick ô này thì mục Bằng chứng là **BẮT BUỘC**

<!-- Reviewer cần biết PR này có được người đọc từng dòng trước khi mở không.
     Đây là thông tin để hiệu chỉnh ĐỘ SÂU REVIEW, không phải để phân biệt đối xử. -->

## Bằng chứng (không phải lời khẳng định)

<!-- "Tôi đã kiểm tra" KHÔNG phải bằng chứng. Đọc bằng chứng nhanh hơn tự chạy lại.
     Nếu bạn không điền được mục này, nghĩa là bạn chưa verify — và bạn phát hiện
     điều đó TRƯỚC khi review, không phải sau. -->

- [ ] Gate `preMerge` xanh — dán vài dòng cuối:
  ```
  ```
- [ ] `typecheck` **TOÀN REPO** xanh
- [ ] E2E đã chạy: <lệnh + kết quả / link CI job>
- [ ] Screenshot / video nếu chạm UI:
- [ ] `features/<id>.json`: platform nào đã đổi `passes=true`, evidence trỏ tới đâu

## Ảnh hưởng ngang (bắt buộc nếu chạm `paths.publicSurface`)

- [ ] Đổi public surface? Nếu có → liệt kê **mọi** consumer bị ảnh hưởng:
- [ ] Consumer đã sửa **trong CÙNG PR này** (không "sửa sau trong PR khác")
- [ ] Đã gắn label `breaking`

## Kích cỡ

- [ ] Dưới ngưỡng `limits.prWarnLines`, hoặc nêu lý do:
- [ ] Một PR một mục đích (không gộp "sửa lint + thêm feature + đổi config")

## Rủi ro & rollback

- Rủi ro chính:
- Cách rollback:
- Có feature flag không?

## Vòng học

- [ ] Nếu bạn để lại một comment review mà **bạn đã từng để lại trước đây**:
      mở kèm một PR nhỏ thêm rule/test cho nó. Link: <PR#>

<!-- Một dòng checkbox. Nhưng nó là khác biệt giữa một team ngày càng nhanh và
     một team dạy lại cùng một bài học mỗi tháng. -->

- [ ] Nếu PR này chạm `.claude/**`: đã cập nhật `.claude/whats-new.md` (đổi `version`)
