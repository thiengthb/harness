# .claude/rules/ — bốn luật viết rule

Trong team, 5 người viết rule sẽ tạo ra **chỉ thị xung đột** — và chỉ thị xung đột
làm model **kém đi**, vì nó phải tốn năng lực dàn hoà trước khi làm việc thật.

```
LUẬT 1 — MỘT CHỦ ĐỀ, MỘT FILE.
         Không có rule về React ở 2 chỗ. react.md là nơi DUY NHẤT nói về React.

LUẬT 2 — MỌI RULE PHẢI CÓ `paths` FRONTMATTER (trừ 3–5 rule an toàn toàn cục).
         Rule không có paths = thuế context cho mọi người ở mọi request.

LUẬT 3 — CẤM NEGATIVE CONSTRAINT trừ 3 nhóm: production, secret, migration đã merge.
         Muốn thêm nhóm thứ 4 → PR có 2 approve và ghi lý do.

LUẬT 4 — MỌI RULE PHẢI CÓ CHỦ + NGÀY + ĐIỀU KIỆN THOÁT.
```

## Khuôn

```markdown
---
paths: ["packages/ui/**", "apps/web/**"]
owner: "@lan"
added: 2026-07-14
expires-review: 2026-10-14
why: "Ba lần agent tạo component mới không dùng token, PR #221 #240 #256"
---
# UI rules
- Component mới đặt trong packages/ui, không đặt trong apps/*.
- Màu/spacing chỉ từ token.
```

Trường `why` **kèm số PR cụ thể** là mẹo nhỏ có tác dụng lớn: nó biến rule từ
*ý kiến* thành *bằng chứng*, và khi review bạn hỏi được
*"ba PR đó còn có thể xảy ra không?"*.

## Trước khi thêm một rule, hỏi

Có biểu diễn được ở dạng rẻ hơn không? Theo thứ tự:

```
test > generator > lint/hook > verification skill > gotcha 1 dòng > skill > RULE
```

Rule cứng là dạng **đắt nhất và mục nhanh nhất**. Nó gần như không chuyển được
sang model mới — model đời sau thường không cần nó nữa, nhưng nó vẫn ngồi đó
tiêu context và gây xung đột. Xem `knowledge/README.md`.

## Kiểm tra

```
node tooling/harness-size.mjs
```
