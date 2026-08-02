---
paths: ["**/*.gen.*", "**/generated/**", "**/migrations/**", "**/dist/**"]
owner: "@dri"
added: 2026-08-03
expires-review: 2027-02-03
why: "Hook block-generated-edit.mjs chặn cơ học; rule này giải thích PHẢI LÀM GÌ THAY THẾ"
exit-condition: "Khi repo không còn codegen."
---

# File generated — read-only

Bạn đang mở một file **sinh ra tự động**. Hook sẽ chặn nếu bạn cố ghi.

- Sửa **NGUỒN** (schema / template / migration generator), rồi chạy lệnh `gen`
  khai trong `harness.config.json → commands.gen`.
- Sửa ở đây thì build sau ghi đè, và bạn mất 40 phút để hiểu tại sao
  "sửa rồi mà vẫn lỗi".

# Migration

- **Forward-only.** Không sửa migration đã merge.
- Mọi migration phải có **rollback plan viết trong chính file**.
- Trước khi tạo bảng/cột mới: grep xem đã có thứ tương tự chưa.
- Migration **KHÔNG BAO GIỜ** chạy lên production từ session agent.
