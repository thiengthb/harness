# Learnings — tuần <W>, <tên bạn>

<!--
  MỘT FILE MỖI NGƯỜI MỖI TUẦN:  .claude/learnings/2026-W31-lan.md
  Không bao giờ conflict với người khác.

  Đây là kỹ thuật chống conflict rẻ nhất và hiệu quả nhất trong toàn bộ harness:
  CHIA FILE THEO NGƯỜI / THEO ISSUE, thay vì cùng ghi vào một file.

  Đây là ĐỀ XUẤT, chưa phải harness. Người (DRI) quyết định promote → /knowledge-promote.
-->

## <triệu chứng, một câu>

**Lần xuất hiện** (cần ≥2 — một lần là ngẫu nhiên):
- PR #___ — chuyện gì đã xảy ra
- PR #___ — lần thứ hai

**Lớp lỗi:** context | tools | orchestration | state | verification | recovery | economics

**Dạng biểu diễn đề xuất** (chọn cái CAO NHẤT khả thi):

```
1 test/contract  2 generator  3 computational-control  4 verification-skill
5 gotcha 1 dòng  6 skill      7 rule cứng ← đắt nhất, mục nhanh nhất
```

Chọn: `___`
Vì sao không dùng được dạng rẻ hơn: ___

**Tầng:** org | user | project | project-local

**Scope** (quyết định nó có đi được sang repo khác không):
`universal` | `stack:<tên>` | `project`

Test: *"Nếu tôi xoá repo này, mục này còn giá trị không?"*

**Đặt ở tầng nào của thang độ trễ** — và vì sao không đặt được ở tầng nhanh hơn: ___

**Chi phí bảo trì dự kiến:** ___

**ĐIỀU KIỆN THOÁT** (bắt buộc — làm sao biết nó hết cần thiết): ___

---

## Đề xuất CẮT BỎ (bắt buộc tối thiểu 1 mục mỗi tuần)

- [ ] Skill/rule/MCP/hook nào không được dùng tuần qua?
- [ ] Mục nào trong AGENTS.md không còn đúng với code hiện tại?
- [ ] Bài học nào quá hạn `expires-review`?

Không có mục này, mọi retro chỉ thêm, và harness thành nghĩa địa của những
giả định đã hết hạn.
