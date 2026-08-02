---
paths: ["CHANGEME/**/*.ext"]
owner: "@CHANGEME"
added: YYYY-MM-DD
expires-review: YYYY-MM-DD
why: "Ba lần agent làm sai điều này — PR #___ #___ #___"
exit-condition: "Làm sao biết rule này hết cần thiết. BẮT BUỘC."
---

# <chủ đề>

<!--
  BỐN LUẬT (xem README.md cùng thư mục):
  1. MỘT CHỦ ĐỀ, MỘT FILE
  2. Mọi rule PHẢI có `paths` (trừ 3–5 rule an toàn toàn cục)
  3. CẤM negative constraint trừ 3 nhóm: production, secret, migration đã merge
  4. Mọi rule PHẢI có chủ + ngày + điều kiện thoát

  TRƯỚC KHI VIẾT RULE NÀY, HỎI: có biểu diễn được ở dạng rẻ hơn không?
    test > generator > lint/hook > verification skill > gotcha 1 dòng > skill > RULE
  Rule cứng là dạng ĐẮT NHẤT và MỤC NHANH NHẤT. Nó thường không chuyển được sang
  model mới — model đời sau không cần nó nữa, nhưng nó vẫn ngồi đó tiêu context
  và gây xung đột với các chỉ thị khác.

  Trường `why` KÈM SỐ PR là mẹo nhỏ tác dụng lớn: nó biến rule từ Ý KIẾN thành
  BẰNG CHỨNG, và khi review bạn hỏi được "ba PR đó còn có thể xảy ra không?".
-->

- <luật, ở thể khẳng định. Nói LÀM GÌ, không chỉ nói ĐỪNG LÀM GÌ.>
- <mỗi dòng phải là thứ agent KHÔNG suy ra được từ code.>
