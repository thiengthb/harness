---
name: knowledge-promote
description: Chuyển một bài học từ đề xuất thành tài sản bền, mang đi được sang
  project khác. Dùng khi DRI đã duyệt một mục trong .claude/learnings/.
allowed-tools: [Read, Write, Edit, Bash, Grep, Glob]
---

# Promote một bài học

Bước 4 của vòng học. Đây là chỗ trí tuệ trở thành **tài sản chuyển được** thay vì
một ghi chú sẽ mục.

> Chỉ chạy skill này khi DRI đã duyệt. Nếu chưa: `/harness-propose`.

## 1. Kiểm điều kiện promote

```
☐ Xuất hiện ≥2 lần độc lập, có số PR/commit
☐ Đã chọn dạng biểu diễn RẺ NHẤT khả thi (1–7, xem knowledge/README.md)
☐ Eval regression không tụt:   node evals/run.mjs
☐ Có điều kiện thoát viết rõ
```

Thiếu bất kỳ dòng nào → dừng, nói rõ thiếu gì.

## 2. Gán scope — quyết định nó có đi được sang repo khác không

Test một câu: **"Nếu tôi xoá repo này, mục này còn giá trị không?"**

| Scope | Trả lời | Ví dụ |
|---|---|---|
| `universal` | còn, ở mọi repo | "không merge tay lockfile", chặn force push |
| `stack:<tên>` | còn, nếu còn dùng stack đó | "Metro cần `--clear` sau khi sửa package nội bộ" |
| `project` | không còn | "port 5432 phải chạy db:up trước" |

Không chắc giữa `project` và `stack:*` → hỏi *"repo khác cùng stack có gặp không?"*
Có → `stack:*`. Đa số người gán `project` quá tay và làm mất trí tuệ mang đi được.

## 3. Tạo file lesson

`knowledge/lessons/<NNNN>-<slug>.md` từ `_TEMPLATE.md`. Id kế tiếp: xem `knowledge/index.json`.

Điền đủ frontmatter. `exit-condition` **không được để trống** —
bài học không có điều kiện thoát sẽ sống mãi mãi và thành dead weight.

## 4. Hiện thực cơ chế

Đây là phần thật. Bài học không có `artifacts` chỉ là một ghi chú.

| Dạng | Đặt ở đâu |
|---|---|
| test / contract | trong test suite của repo |
| generator | `tooling/generators/` |
| computational control | `.claude/hooks/*.mjs`, lint rule, CI job, dep rule |
| verification skill | `.claude/skills/verify-*/` |
| gotcha | một dòng trong `AGENTS.md §Gotchas` |
| rule | `.claude/rules/<chủ-đề>.md` với `paths` frontmatter + `owner` + `expires-review` |

Trỏ `artifacts:` tới đúng những file bạn vừa tạo/sửa — **export dựa vào trường này**
để mang cơ chế đi cùng bài học.

Sửa `.claude/**` cần DRI (hook chặn agent). Nếu bạn là agent: chuẩn bị nội dung
đầy đủ và **giao cho người thực hiện bước này**.

## 5. Cập nhật + kiểm

```
node tooling/knowledge/lint.mjs      # sinh lại index.json, kiểm frontmatter
node tooling/test-hooks.mjs          # nếu vừa thêm/sửa hook — THÊM CASE TEST MỚI
node tooling/harness-size.mjs        # harness có phình không?
```

Thêm hook mà không thêm case vào `tooling/test-hooks.mjs` = thêm code có quyền
chặn công việc cả team mà không ai test.

## 6. Thông báo

Cập nhật `.claude/whats-new.md`: đổi `version`, viết 3 dòng.
Harness đổi mà không thông báo = nửa team hành xử theo rule cũ.

## 7. Cắt một thứ

Mỗi lần promote, xét bỏ một thứ. Không bắt buộc bỏ, **bắt buộc xét**.
Ghi kết quả xét vào cùng PR.

## 8. Nếu scope là universal hoặc stack

```
node tooling/knowledge/export.mjs
```

Commit `.harness-pack/` vào repo harness trung tâm và **gắn tag**.
Repo khác pin theo tag/sha, không bao giờ theo `main` — một commit sai ở `main`
làm hỏng đồng thời mọi repo của bạn.
