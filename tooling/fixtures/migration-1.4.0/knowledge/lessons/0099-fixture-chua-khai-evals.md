---
id: L0099
title: FIXTURE của migration 002 — bài học cưỡng chế bằng máy mà CHƯA khai evals
scope: universal
class: verification
representation: computational-control
status: active
owner: "@fixture"
added: 2026-08-05
expires-review: 2027-02-05
occurrences: 2
evidence:
  - "Không phải bài học thật. Tồn tại để migration 002 ĐẾM được 1 bài học chưa khai `evals:`."
artifacts:
  - "tooling/fixtures/migration-1.4.0/"
exit-condition: >
  Xoá khi migration 002 bị gỡ khỏi harness-migrations/.
---

## NEO mà test khẳng định

Ba thứ phải đúng để fixture còn tác dụng:

- `status: active` và `representation: computational-control` ⇒ nằm trong `NEEDS_GATE` của
  migration 002, nên nó **được đếm**.
- **KHÔNG có khoá `evals:`** ⇒ migration phải in dòng nhắc. Thêm `evals:` vào đây là làm
  nhánh đếm không bao giờ chạy — test vẫn xanh, nhưng xanh vô nghĩa.
- Dòng mốc `FIXTURE-KHONG-DUOC-SUA` ngay dưới: điều kiện ⑤ khẳng định nó **còn nguyên** sau
  `up()`. Migration 002 tự nhận là *"không đụng vào bài học của project"* — thêm `evals:` hộ
  người viết là quyết định của người, không phải của script. Đó là lời hứa đắt nhất của
  migration này và cũng là lời hứa dễ vỡ im lặng nhất, nên nó là thứ được assert.

FIXTURE-KHONG-DUOC-SUA
