---
id: L0001
title: Agent merge tay lockfile khi có conflict, tạo cây dependency không tồn tại
scope: universal
class: orchestration
representation: computational-control
status: active
owner: "@dri"
added: 2026-08-03
expires-review: 2027-02-03
occurrences: 3
evidence:
  - "Bài học nền, đi kèm harness baseline v1"
  - "Mẫu tham chiếu — thay bằng số PR thật của bạn khi gặp lần đầu"
artifacts:
  - "AGENTS.md §Git & PR"
  - ".github/workflows/ci.yml (job lockfile-integrity)"
exit-condition: >
  Khi package manager tự resolve được lockfile conflict mà không cần
  reinstall, hoặc khi repo không còn lockfile.
---

## Triệu chứng

Lockfile conflict xuất hiện gần như mỗi ngày trong team dùng agent (nhiều người
thêm dependency song song). Agent coi nó như một conflict văn bản bình thường và
merge tay từng hunk. Kết quả: một lockfile **cú pháp hợp lệ** nhưng mô tả một cây
dependency chưa từng tồn tại. Lỗi hiện ra vài ngày sau, ở máy khác, dạng "module
not found" hoặc version lệch không giải thích được.

## Nguyên nhân

Lockfile là **output của một solver**, không phải source. Merge văn bản hai output
của cùng một solver không cho ra output hợp lệ của solver đó.

Đáng chú ý: chỉ ~4% file conflict là manifest/lockfile — nó **thường xuyên nhưng rẻ**.
Đừng over-engineer; một luật ba dòng là đủ.

## Cơ chế

Luật trong AGENTS.md:

```
1. git checkout --ours <lockfile>   (hoặc --theirs, không quan trọng)
2. chạy lại lệnh install của package manager
3. git add <lockfile>
4. Kiểm: diff của package.json so với main phải khớp đúng dependency bạn thật sự thêm
```

Cộng CI check: cài từ lockfile ở trạng thái frozen, fail nếu lockfile không nhất quán
với manifest. Đây là dạng (3) computational-control — bền hơn nhiều so với dạng (7)
một dòng nhắc nhở trong prompt.

## Chuyển đi được không

`universal`. Đúng với npm/pnpm/yarn/bun/cargo/poetry/go.sum — mọi lockfile đều là
output của solver. Chỉ đổi tên lệnh, không đổi luật.
